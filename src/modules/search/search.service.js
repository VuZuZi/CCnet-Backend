import mongoose from 'mongoose';
import AppError from '../../core/AppError.js';

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function fuzzyScore(query, target) {
  const q = normalizeText(query);
  const t = normalizeText(target);

  if (!q || !t) return 0;

  if (t.startsWith(q)) return 1000 + q.length;
  if (t.includes(q)) return 700 + q.length;

  let qi = 0;
  let score = 0;
  let streak = 0;

  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      qi += 1;
      streak += 1;
      score += 10 + streak * 2;
    } else {
      streak = 0;
      score -= 1;
    }
  }

  if (qi !== q.length) return 0;
  return 300 + score;
}

function escapeRegex(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class SearchService {
  async globalSearch(userId, q, limit = 8) {
    if (!userId) throw new AppError('Unauthorized', 401);

    const query = String(q || '').trim();
    if (!query) return { users: [], projects: [], orgs: [] };

    const rx = new RegExp(escapeRegex(query), 'i');

    const User = mongoose.models.User || mongoose.model('User');
    const excludeUserId = mongoose.Types.ObjectId.isValid(String(userId))
      ? new mongoose.Types.ObjectId(String(userId))
      : userId;

    const userCandidates = await User.find(
      {
        _id: { $ne: excludeUserId },
        $or: [
          { fullName: rx },
          { email: rx },
        ],
      },
      {
        _id: 1,
        fullName: 1,
        email: 1,
        avatar: 1,
      }
    )
      .limit(60)
      .lean();

    const users = (userCandidates || [])
      .map((u) => {
        const displayName = u.fullName || u.email || '';
        const score = Math.max(
          fuzzyScore(query, displayName),
          fuzzyScore(query, u.email)
        );

        if (score <= 0) return null;

        return {
          id: String(u._id),
          fullName: u.fullName || '',
          email: u.email || '',
          avatar: u.avatar || '',
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);

    let projects = [];
    try {
      const Project = mongoose.models.Project || mongoose.model('Project');

      const projectCandidates = await Project.find(
        {
          $or: [
            { title: rx },
            { description: rx },
            { 'location.address': rx },
          ],
        },
        {
          _id: 1,
          title: 1,
          description: 1,
          'location.address': 1,
          category: 1,
          status: 1,
        }
      )
        .limit(60)
        .lean();

      projects = (projectCandidates || [])
        .map((p) => {
          const projectTitle = p.title || '';
          const projectSubtitle =
            p.location?.address || p.category || p.status || '';

          const score = Math.max(
            fuzzyScore(query, projectTitle),
            fuzzyScore(query, p.description),
            fuzzyScore(query, p.location?.address)
          );

          if (score <= 0) return null;

          return {
            id: String(p._id),
            name: projectTitle,
            code: projectSubtitle,
            score,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ score, ...rest }) => rest);
    } catch {
      projects = [];
    }

    const orgs = [];

    return { users, projects, orgs };
  }
}

export default SearchService;