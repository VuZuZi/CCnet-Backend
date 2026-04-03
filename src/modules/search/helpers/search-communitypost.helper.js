import mongoose from "mongoose";

const DEFAULT_RECENT_DAYS = 7;

export function escapeRegex(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : value;
}

export function buildCommunityPostQuery({ rx, filters = {}, viewedPostIds = [] }) {
  const {
    recentOnly = false,
    viewedOnly = false,
    location = "",
  } = filters;

  const mongoQuery = {
    isDeleted: false,
    status: "active",
    privacy: "public",
    $or: [{ content: rx }, { hashtags: rx }, { "author.fullName": rx }],
  };

  if (recentOnly) {
    const recentFrom = new Date(
      Date.now() - DEFAULT_RECENT_DAYS * 24 * 60 * 60 * 1000
    );
    mongoQuery.createdAt = { $gte: recentFrom };
  }

  if (location) {
    const locationRx = new RegExp(escapeRegex(location), "i");
    mongoQuery.$and = [
      ...(mongoQuery.$and || []),
      {
        $or: [
          { taggedLocation: locationRx },
          { "location.address": locationRx },
          { address: locationRx },
        ],
      },
    ];
  }

  if (viewedOnly) {
    if (!viewedPostIds.length) return null;
    mongoQuery._id = { $in: viewedPostIds };
  }

  return mongoQuery;
}

export function rankCommunityPostCandidates(
  candidates,
  query,
  fuzzyScore,
  mapper
) {
  return (candidates || [])
    .map((item) => {
      const hashtagsText = Array.isArray(item.hashtags)
        ? item.hashtags.join(" ")
        : "";

      const score = Math.max(
        fuzzyScore(query, item.content),
        fuzzyScore(query, hashtagsText),
        fuzzyScore(query, item.author?.fullName)
      );

      if (score <= 0) return null;
      return mapper(item, score);
    })
    .filter(Boolean);
}

export function sortCommunityPosts(items, dateOrder = "newest") {
  const ranked = [...(items || [])];

  ranked.sort((a, b) => {
    const aTime = new Date(a.payload?.createdAt || 0).getTime();
    const bTime = new Date(b.payload?.createdAt || 0).getTime();

    if (dateOrder === "oldest") {
      if (aTime !== bTime) return aTime - bTime;
      return b.score - a.score;
    }

    if (dateOrder === "newest") {
      if (aTime !== bTime) return bTime - aTime;
      return b.score - a.score;
    }

    return b.score - a.score;
  });

  return ranked;
}