function trimText(text, max = 120) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}...`;
}

export function mapUserResult(item, score, kind = "user") {
  return {
    id: String(item._id),
    kind,
    title:
      item.fullName ||
      item.email ||
      (kind === "organizer" ? "Organizer" : "User"),
    subtitle:
      item.headline ||
      item.location ||
      item.email ||
      (kind === "organizer" ? "Organizer" : ""),
    avatar: item.avatar || "",
    link: `/users/${String(item._id)}`,
    payload: {
      id: String(item._id),
      fullName: item.fullName || "",
      email: item.email || "",
      avatar: item.avatar || "",
      role: item.role || kind,
      headline: item.headline || "",
      location: item.location || "",
    },
    score,
  };
}

export function mapProjectResult(item, score) {
  return {
    id: String(item._id),
    kind: "project",
    title: item.title || "Project",
    subtitle: item.location?.address || item.category || item.status || "",
    avatar: item.coverMedia?.url || "",
    link: `/projects/${String(item._id)}`,
    payload: {
      id: String(item._id),
      name: item.title || "",
      description: item.description || "",
      category: item.category || "",
      status: item.status || "",
      address: item.location?.address || "",
    },
    score,
  };
}

export function mapNeedHelpResult(item, score) {
  const firstEvidence = Array.isArray(item.evidences) ? item.evidences[0] : null;

  return {
    id: String(item._id),
    kind: "needhelp",
    title: item.title || "Need help",
    subtitle:
      item.location?.address ||
      item.urgencyLevel ||
      trimText(item.story, 110) ||
      "",
    avatar: firstEvidence?.mediaType === "image" ? firstEvidence.url || "" : "",
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
}

export function mapCommunityPostResult(post, score) {
  const hashtagsText = Array.isArray(post.hashtags)
    ? post.hashtags.join(" ")
    : "";

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
      taggedLocation:
        post.taggedLocation ||
        post.location?.address ||
        post.address ||
        "",
      location: post.location || null,
      address: post.address || "",
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
}