import {
  buildCandidateBatchMeta,
  sliceBatch,
} from "./search-ranking.helper.js";

const SEARCH_PRIORITY = ["organizer", "project", "needhelp", "communitypost"];
const NAVBAR_PRIORITY = [
  "user",
  "organizer",
  "project",
  "needhelp",
  "communitypost",
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildZeroCounts() {
  return {
    all: 0,
    organizer: 0,
    project: 0,
    needhelp: 0,
    communitypost: 0,
    user: 0,
  };
}

function buildCounts(totalByType = {}) {
  return {
    all:
      Number(totalByType.organizer || 0) +
      Number(totalByType.project || 0) +
      Number(totalByType.needhelp || 0) +
      Number(totalByType.communitypost || 0) +
      Number(totalByType.user || 0),
    organizer: Number(totalByType.organizer || 0),
    project: Number(totalByType.project || 0),
    needhelp: Number(totalByType.needhelp || 0),
    communitypost: Number(totalByType.communitypost || 0),
    user: Number(totalByType.user || 0),
  };
}

function buildBaseMeta({ type, includeCounts }) {
  return {
    resultMode: type === "navbar" ? "grouped" : "flat",
    paginationMode: type === "navbar" ? null : "candidate_offset",
    countsIncluded: Boolean(includeCounts),

    // business semantics
    sidebarCountsIncludeUser: true,
    pageAllResultsIncludeUser: false,
  };
}

function buildNavbarGroups(allGroups = {}) {
  return {
    user: toArray(allGroups.user),
    organizer: toArray(allGroups.organizer),
    project: toArray(allGroups.project),
    needhelp: toArray(allGroups.needhelp),
    communitypost: toArray(allGroups.communitypost),
  };
}

function buildFlatResults(groups = {}, priority = SEARCH_PRIORITY) {
  return priority.flatMap((key) => toArray(groups[key]));
}

export function buildEmptySearchResponse({
  query = "",
  type,
  limit,
  offset,
  filters,
  includeCounts = true,
}) {
  return {
    query,
    type,
    limit,
    offset,
    filters,
    counts: includeCounts ? buildZeroCounts() : null,
    groups: type === "navbar" ? buildNavbarGroups() : undefined,
    results: [],
    batch:
      type === "navbar"
        ? null
        : buildCandidateBatchMeta({
            offset,
            limit,
            candidateTotal: 0,
          }),
    meta: buildBaseMeta({ type, includeCounts }),
  };
}

export function buildResponseByType({
  query,
  type,
  limit,
  offset,
  filters,
  allGroups,
  totalByType,
  includeCounts = true,
}) {
  const counts = includeCounts ? buildCounts(totalByType) : null;

  if (type === "navbar") {
    const groups = buildNavbarGroups(allGroups);

    return {
      query,
      type,
      limit,
      offset,
      filters,
      counts,
      groups,
      results: buildFlatResults(groups, NAVBAR_PRIORITY),
      batch: null,
      meta: buildBaseMeta({ type, includeCounts }),
    };
  }

  const sourceItems =
    type === "all"
      ? buildFlatResults(
          {
            organizer: allGroups.organizer,
            project: allGroups.project,
            needhelp: allGroups.needhelp,
            communitypost: allGroups.communitypost,
          },
          SEARCH_PRIORITY
        )
      : toArray(allGroups[type]);

  return {
    query,
    type,
    limit,
    offset,
    filters,
    counts,
    results: sliceBatch(sourceItems, offset, limit),
    batch: buildCandidateBatchMeta({
      offset,
      limit,
      candidateTotal: sourceItems.length,
    }),
    meta: buildBaseMeta({ type, includeCounts }),
  };
}