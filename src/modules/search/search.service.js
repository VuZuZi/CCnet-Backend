import mongoose from "mongoose";
import AppError from "../../core/AppError.js";

const SEARCH_PRIORITY = ["organizer", "project", "needhelp", "communitypost"];
const NAVBAR_PRIORITY = [
  "user",
  "organizer",
  "project",
  "needhelp",
  "communitypost",
];

function normalizeText(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : value;
}

function pickModel(names = []) {
  for (const name of names) {
    if (mongoose.models[name]) return mongoose.models[name];
  }

  for (const name of names) {
    try {
      return mongoose.model(name);
    } catch {
      // ignore
    }
  }

  return null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildFlatResults(groups = {}, priority = SEARCH_PRIORITY) {
  return priority.flatMap((key) => toArray(groups[key] || []));
}

function trimText(text, max = 120) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}...`;
}

class SearchService {
  async globalSearch(userId, paramsOrQuery, legacyLimit = 8) {
    if (!userId) throw new AppError("Unauthorized", 401);

    const params =
      typeof paramsOrQuery === "object" && paramsOrQuery !== null
        ? paramsOrQuery
        : {
            q: paramsOrQuery,
            limit: legacyLimit,
            type: "all",
            page: 1,
          };

    const query = String(params.q || "").trim();
    const limit = Number(params.limit || 8);
    const type = String(params.type || "all").toLowerCase();
    const page = Number(params.page || 1);

    if (!query) {
      return {
        query: "",
        type,
        page,
        limit,
        counts: {
          all: 0,
          organizer: 0,
          project: 0,
          needhelp: 0,
          communitypost: 0,
          user: 0,
        },
        groups: {
          organizer: [],
          project: [],
          needhelp: [],
          communitypost: [],
          user: [],
        },
        results: [],
        users: [],
        projects: [],
        orgs: [],
      };
    }

    const rx = new RegExp(escapeRegex(query), "i");
    const excludeUserId = getObjectId(userId);

    // Luôn query đủ tất cả nhóm để sidebar counts luôn đúng ở mọi filter
    const [
      organizerResults,
      projectResults,
      needHelpResults,
      communityPostResults,
      userResults,
    ] = await Promise.all([
      this.searchOrganizers({ query, rx, limit, excludeUserId }),
      this.searchProjects({ query, rx, limit }),
      this.searchNeedHelps({ query, rx, limit }),
      this.searchCommunityPosts({ query, rx, limit }),
      this.searchUsers({ query, rx, limit, excludeUserId }),
    ]);

    const allGroups = {
      organizer: organizerResults,
      project: projectResults,
      needhelp: needHelpResults,
      communitypost: communityPostResults,
      user: userResults,
    };

    const counts = {
      all:
        organizerResults.length +
        projectResults.length +
        needHelpResults.length +
        communityPostResults.length +
        userResults.length,
      organizer: organizerResults.length,
      project: projectResults.length,
      needhelp: needHelpResults.length,
      communitypost: communityPostResults.length,
      user: userResults.length,
    };

    let groups = {};
    let results = [];

    if (type === "navbar") {
      groups = {
        user: userResults,
        organizer: organizerResults,
        project: projectResults,
        needhelp: needHelpResults,
        communitypost: communityPostResults,
      };

      results = buildFlatResults(groups, NAVBAR_PRIORITY);
    } else if (type === "all") {
      groups = {
        organizer: organizerResults,
        project: projectResults,
        needhelp: needHelpResults,
        communitypost: communityPostResults,
      };

      // Trang all không render user trong list
      results = buildFlatResults(groups, SEARCH_PRIORITY);
    } else {
      groups = {
        [type]: toArray(allGroups[type]),
      };

      results = toArray(allGroups[type]);
    }

    return {
      query,
      type,
      page,
      limit,
      counts,
      groups,
      results,
      users: userResults,
      projects: projectResults,
      orgs: organizerResults,
    };
  }

  async searchUsers({ query, rx, limit, excludeUserId }) {
    const User = pickModel(["User"]);
    if (!User) return [];

    const candidates = await User.find(
      {
        _id: { $ne: excludeUserId },
        isActive: { $ne: false },
        $and: [
          {
            $or: [
              { role: { $exists: false } },
              { role: null },
              { role: { $not: /^organizer$/i } },
            ],
          },
          {
            $or: [
              { fullName: rx },
              { email: rx },
              { location: rx },
              { headline: rx },
            ],
          },
        ],
      },
      {
        _id: 1,
        fullName: 1,
        email: 1,
        avatar: 1,
        role: 1,
        location: 1,
        headline: 1,
      }
    )
      .limit(60)
      .lean();

    return (candidates || [])
      .map((u) => {
        const score = Math.max(
          fuzzyScore(query, u.fullName),
          fuzzyScore(query, u.email),
          fuzzyScore(query, u.location),
          fuzzyScore(query, u.headline)
        );

        if (score <= 0) return null;

        return {
          id: String(u._id),
          kind: "user",
          title: u.fullName || u.email || "Unknown user",
          subtitle: u.headline || u.location || u.email || "",
          avatar: u.avatar || "",
          role: u.role || "user",
          link: `/users/${String(u._id)}`,
          payload: {
            id: String(u._id),
            fullName: u.fullName || "",
            email: u.email || "",
            avatar: u.avatar || "",
            role: u.role || "user",
          },
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  async searchOrganizers({ query, rx, limit, excludeUserId }) {
    const User = pickModel(["User"]);
    if (!User) return [];

    const candidates = await User.find(
      {
        _id: { $ne: excludeUserId },
        isActive: { $ne: false },
        role: { $regex: /^organizer$/i },
        $or: [
          { fullName: rx },
          { email: rx },
          { location: rx },
          { headline: rx },
        ],
      },
      {
        _id: 1,
        fullName: 1,
        email: 1,
        avatar: 1,
        location: 1,
        headline: 1,
      }
    )
      .limit(60)
      .lean();

    return (candidates || [])
      .map((u) => {
        const score = Math.max(
          fuzzyScore(query, u.fullName),
          fuzzyScore(query, u.email),
          fuzzyScore(query, u.location),
          fuzzyScore(query, u.headline)
        );

        if (score <= 0) return null;

        return {
          id: String(u._id),
          kind: "organizer",
          title: u.fullName || u.email || "Organizer",
          subtitle: u.headline || u.location || u.email || "Organizer",
          avatar: u.avatar || "",
          link: `/users/${String(u._id)}`,
          payload: {
            id: String(u._id),
            fullName: u.fullName || "",
            email: u.email || "",
            avatar: u.avatar || "",
          },
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  async searchProjects({ query, rx, limit }) {
    const Project = pickModel(["Project"]);
    if (!Project) return [];

    const candidates = await Project.find(
      {
        status: "ACTIVE",
        $or: [{ title: rx }, { description: rx }, { "location.address": rx }],
      },
      {
        _id: 1,
        title: 1,
        description: 1,
        "location.address": 1,
        category: 1,
        status: 1,
        coverMedia: 1,
      }
    )
      .limit(60)
      .lean();

    return (candidates || [])
      .map((p) => {
        const score = Math.max(
          fuzzyScore(query, p.title),
          fuzzyScore(query, p.description),
          fuzzyScore(query, p.location?.address)
        );

        if (score <= 0) return null;

        return {
          id: String(p._id),
          kind: "project",
          title: p.title || "Project",
          subtitle: p.location?.address || p.category || p.status || "",
          avatar: p.coverMedia?.url || "",
          link: `/projects/${String(p._id)}`,
          payload: {
            id: String(p._id),
            name: p.title || "",
            description: p.description || "",
            category: p.category || "",
            status: p.status || "",
            address: p.location?.address || "",
          },
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  async searchNeedHelps({ query, rx, limit }) {
    const HelpRequest = pickModel(["HelpRequest", "NeedHelp", "Needhelp"]);
    if (!HelpRequest) return [];

    const candidates = await HelpRequest.find(
      {
        isDeleted: false,
        $or: [{ title: rx }, { story: rx }, { "location.address": rx }],
      },
      {
        _id: 1,
        title: 1,
        story: 1,
        "location.address": 1,
        urgencyLevel: 1,
        status: 1,
        evidences: 1,
      }
    )
      .limit(60)
      .lean();

    return (candidates || [])
      .map((item) => {
        const score = Math.max(
          fuzzyScore(query, item.title),
          fuzzyScore(query, item.story),
          fuzzyScore(query, item.location?.address)
        );

        if (score <= 0) return null;

        const firstEvidence = Array.isArray(item.evidences)
          ? item.evidences[0]
          : null;

        return {
          id: String(item._id),
          kind: "needhelp",
          title: item.title || "Need help",
          subtitle:
            item.location?.address ||
            item.urgencyLevel ||
            trimText(item.story, 110) ||
            "",
          avatar:
            firstEvidence?.mediaType === "image" ? firstEvidence.url || "" : "",
          link: `/need-help/${String(item._id)}`,
          payload: {
            id: String(item._id),
            title: item.title || "",
            story: item.story || "",
            urgencyLevel: item.urgencyLevel || "",
            status: item.status || "",
            address: item.location?.address || "",
          },
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  async searchCommunityPosts({ query, rx, limit }) {
    const Post = pickModel(["Post"]);
    if (!Post) return [];

    const candidates = await Post.find(
      {
        isDeleted: false,
        status: "active",
        privacy: "public",
        $or: [{ content: rx }, { hashtags: rx }, { "author.fullName": rx }],
      },
      {
        _id: 1,
        content: 1,
        hashtags: 1,
        author: 1,
        images: 1,
        stats: 1,
        createdAt: 1,
        latestComments: 1,
        privacy: 1,
      }
    )
      .limit(60)
      .lean();

    return (candidates || [])
      .map((post) => {
        const hashtagsText = Array.isArray(post.hashtags)
          ? post.hashtags.join(" ")
          : "";

        const score = Math.max(
          fuzzyScore(query, post.content),
          fuzzyScore(query, hashtagsText),
          fuzzyScore(query, post.author?.fullName)
        );

        if (score <= 0) return null;

        return {
          id: String(post._id),
          kind: "communitypost",
          title:
            trimText(post.content, 80) ||
            (post.author?.fullName
              ? `Post by ${post.author.fullName}`
              : "Community post"),
          subtitle: post.author?.fullName
            ? `By ${post.author.fullName}`
            : trimText(hashtagsText, 80),
          avatar: post.author?.avatar || "",
          link: `/community/${String(post._id)}`,
          payload: {
            _id: String(post._id),
            content: post.content || "",
            images: Array.isArray(post.images) ? post.images : [],
            author: {
              _id: post.author?._id || null,
              fullName: post.author?.fullName || "",
              avatar: post.author?.avatar || "",
              username: post.author?.username || "",
            },
            privacy: post.privacy || "public",
            createdAt: post.createdAt || null,
            latestComments: Array.isArray(post.latestComments)
              ? post.latestComments
              : [],
            stats: post.stats || {
              likes: 0,
              comments: 0,
              shares: 0,
              views: 0,
            },
            userReaction: null,
          },
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }
}

export default SearchService;