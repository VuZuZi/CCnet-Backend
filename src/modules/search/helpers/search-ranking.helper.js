export function buildRankedResults(items, getScore, mapItem) {
  return (items || [])
    .map((item) => {
      const score = Number(getScore(item) || 0);
      if (score <= 0) return null;

      const mapped = mapItem(item, score);
      if (!mapped) return null;

      return mapped;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

export function sliceBatch(items, offset, limit) {
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = Math.max(Number(limit) || 1, 1);
  return items.slice(safeOffset, safeOffset + safeLimit);
}

export function buildCandidateBatchMeta({ offset, limit, candidateTotal }) {
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = Math.max(Number(limit) || 1, 1);
  const safeCandidateTotal = Math.max(Number(candidateTotal) || 0, 0);

  const nextOffset = safeOffset + safeLimit;
  const hasMore = nextOffset < safeCandidateTotal;

  return {
    mode: "candidate_offset",
    offset: safeOffset,
    limit: safeLimit,
    candidateTotal: safeCandidateTotal,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
  };
}