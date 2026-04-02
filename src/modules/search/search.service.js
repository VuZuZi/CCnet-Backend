import AppError from "../../core/AppError.js";
import SearchPostView from "./searchPostView.model.js";
import { normalizeSearchParams } from "./helpers/search-params.helper.js";
import { fuzzyScore, pickModel } from "./helpers/search-core.helper.js";
import {
  buildEmptySearchResponse,
  buildResponseByType,
} from "./helpers/search-response.helper.js";
import {
  buildCommunityPostQuery,
  rankCommunityPostCandidates,
  sortCommunityPosts,
  escapeRegex,
  getObjectId,
} from "./helpers/search-communitypost.helper.js";
import {
  mapUserResult,
  mapProjectResult,
  mapNeedHelpResult,
  mapCommunityPostResult,
} from "./helpers/search-result.mapper.js";
import { buildRankedResults } from "./helpers/search-ranking.helper.js";

const RANKING_POOL_LIMIT = 200;
const TYPE_KEYS = ["organizer", "project", "needhelp", "communitypost", "user"];

function createEmptySourceResult() {
  return { items: [], total: 0 };
}

function stripScore(items = []) {
  return items.map(({ score, ...rest }) => rest);
}

class SearchService {
  async globalSearch(userId, paramsOrQuery, legacyLimit = 8) {
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    const { query, limit, offset, type, filters, includeCounts } =
      normalizeSearchParams(paramsOrQuery, legacyLimit);

    if (!query) {
      return buildEmptySearchResponse({
        query: "",
        type,
        limit,
        offset,
        filters,
        includeCounts,
      });
    }

    const rx = new RegExp(escapeRegex(query), "i");
    const excludeUserId = getObjectId(userId);
    const outputLimit = this.getOutputLimitByType(type, limit);

    const { groups, totals } = await this.runSearchSources({
      userId,
      query,
      rx,
      outputLimit,
      excludeUserId,
      filters,
      type,
      includeCounts,
    });

    return buildResponseByType({
      query,
      type,
      limit,
      offset,
      filters,
      allGroups: groups,
      totalByType: totals,
      includeCounts,
    });
  }

  getOutputLimitByType(type, limit) {
    return type === "navbar" ? limit : RANKING_POOL_LIMIT;
  }

  getRequestedKeys({ type, includeCounts }) {
    if (type === "navbar" || type === "all") {
      return TYPE_KEYS;
    }

    if (includeCounts) {
      return TYPE_KEYS;
    }

    return TYPE_KEYS.includes(type) ? [type] : [];
  }

  async runSearchSources({
    userId,
    query,
    rx,
    outputLimit,
    excludeUserId,
    filters,
    type,
    includeCounts,
  }) {
    const requestedKeys = this.getRequestedKeys({ type, includeCounts });

    const tasks = {
      organizer: requestedKeys.includes("organizer")
        ? this.searchOrganizers({
            query,
            rx,
            outputLimit,
            excludeUserId,
          })
        : Promise.resolve(createEmptySourceResult()),
      project: requestedKeys.includes("project")
        ? this.searchProjects({
            query,
            rx,
            outputLimit,
          })
        : Promise.resolve(createEmptySourceResult()),
      needhelp: requestedKeys.includes("needhelp")
        ? this.searchNeedHelps({
            query,
            rx,
            outputLimit,
          })
        : Promise.resolve(createEmptySourceResult()),
      communitypost: requestedKeys.includes("communitypost")
        ? this.searchCommunityPosts({
            userId,
            query,
            rx,
            outputLimit,
            filters,
          })
        : Promise.resolve(createEmptySourceResult()),
      user: requestedKeys.includes("user")
        ? this.searchUsers({
            query,
            rx,
            outputLimit,
            excludeUserId,
          })
        : Promise.resolve(createEmptySourceResult()),
    };

    const [organizer, project, needhelp, communitypost, user] =
      await Promise.all([
        tasks.organizer,
        tasks.project,
        tasks.needhelp,
        tasks.communitypost,
        tasks.user,
      ]);

    return {
      groups: {
        organizer: organizer.items,
        project: project.items,
        needhelp: needhelp.items,
        communitypost: communitypost.items,
        user: user.items,
      },
      totals: {
        organizer: organizer.total,
        project: project.total,
        needhelp: needhelp.total,
        communitypost: communitypost.total,
        user: user.total,
      },
    };
  }

  async markCommunityPostViewed(userId, postId) {
    const Post = pickModel(["Post"]);
    if (!Post) {
      throw new AppError("Post model not found", 500);
    }

    const postObjectId = getObjectId(postId);
    const userObjectId = getObjectId(userId);

    const post = await Post.findOne({
      _id: postObjectId,
      isDeleted: false,
      status: "active",
      privacy: "public",
    })
      .select("_id")
      .lean();

    if (!post) {
      throw new AppError("Post not found", 404);
    }

    await SearchPostView.findOneAndUpdate(
      {
        userId: userObjectId,
        postId: postObjectId,
      },
      {
        $set: {
          viewedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return {
      viewed: true,
      postId: String(postObjectId),
    };
  }

  async searchUsers({ query, rx, outputLimit, excludeUserId }) {
    const User = pickModel(["User"]);
    if (!User) return createEmptySourceResult();

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
      .limit(RANKING_POOL_LIMIT)
      .lean();

    const ranked = buildRankedResults(
      candidates,
      (item) =>
        Math.max(
          fuzzyScore(query, item.fullName),
          fuzzyScore(query, item.email),
          fuzzyScore(query, item.location),
          fuzzyScore(query, item.headline)
        ),
      (item, score) => mapUserResult(item, score, "user")
    );

    return {
      items: stripScore(ranked.slice(0, outputLimit)),
      total: ranked.length,
    };
  }

  async searchOrganizers({ query, rx, outputLimit, excludeUserId }) {
    const User = pickModel(["User"]);
    if (!User) return createEmptySourceResult();

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
        role: 1,
      }
    )
      .limit(RANKING_POOL_LIMIT)
      .lean();

    const ranked = buildRankedResults(
      candidates,
      (item) =>
        Math.max(
          fuzzyScore(query, item.fullName),
          fuzzyScore(query, item.email),
          fuzzyScore(query, item.location),
          fuzzyScore(query, item.headline)
        ),
      (item, score) => mapUserResult(item, score, "organizer")
    );

    return {
      items: stripScore(ranked.slice(0, outputLimit)),
      total: ranked.length,
    };
  }

  async searchProjects({ query, rx, outputLimit }) {
    const Project = pickModel(["Project"]);
    if (!Project) return createEmptySourceResult();

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
      .limit(RANKING_POOL_LIMIT)
      .lean();

    const ranked = buildRankedResults(
      candidates,
      (item) =>
        Math.max(
          fuzzyScore(query, item.title),
          fuzzyScore(query, item.description),
          fuzzyScore(query, item.location?.address)
        ),
      (item, score) => mapProjectResult(item, score)
    );

    return {
      items: stripScore(ranked.slice(0, outputLimit)),
      total: ranked.length,
    };
  }

  async searchNeedHelps({ query, rx, outputLimit }) {
    const HelpRequest = pickModel(["HelpRequest", "NeedHelp", "Needhelp"]);
    if (!HelpRequest) return createEmptySourceResult();

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
      .limit(RANKING_POOL_LIMIT)
      .lean();

    const ranked = buildRankedResults(
      candidates,
      (item) =>
        Math.max(
          fuzzyScore(query, item.title),
          fuzzyScore(query, item.story),
          fuzzyScore(query, item.location?.address)
        ),
      (item, score) => mapNeedHelpResult(item, score)
    );

    return {
      items: stripScore(ranked.slice(0, outputLimit)),
      total: ranked.length,
    };
  }

  async searchCommunityPosts({ userId, query, rx, outputLimit, filters }) {
    const Post = pickModel(["Post"]);
    if (!Post) return createEmptySourceResult();

    let viewedPostIds = [];
    if (filters?.viewedOnly) {
      viewedPostIds = await SearchPostView.distinct("postId", {
        userId: getObjectId(userId),
      });
    }

    const mongoQuery = buildCommunityPostQuery({
      rx,
      filters,
      viewedPostIds,
    });

    if (!mongoQuery) {
      return createEmptySourceResult();
    }

    const candidates = await Post.find(
      mongoQuery,
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
        taggedLocation: 1,
        location: 1,
        address: 1,
      }
    )
      .limit(RANKING_POOL_LIMIT)
      .lean();

    const ranked = sortCommunityPosts(
      rankCommunityPostCandidates(
        candidates,
        query,
        fuzzyScore,
        mapCommunityPostResult
      ),
      filters?.dateOrder
    );

    return {
      items: stripScore(ranked.slice(0, outputLimit)),
      total: ranked.length,
    };
  }
}

export default SearchService;