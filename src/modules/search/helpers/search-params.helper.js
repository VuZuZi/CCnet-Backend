const DEFAULTS = {
  q: "",
  limit: 8,
  offset: 0,
  type: "all",
  recentOnly: false,
  viewedOnly: false,
  dateOrder: "newest",
  location: "",
  includeCounts: true,
};

const VALID_TYPES = new Set([
  "all",
  "navbar",
  "organizer",
  "project",
  "needhelp",
  "communitypost",
  "user",
]);

const VALID_DATE_ORDERS = new Set(["newest", "oldest"]);

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function toInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeType(value) {
  const type = String(value || DEFAULTS.type).trim().toLowerCase();
  return VALID_TYPES.has(type) ? type : DEFAULTS.type;
}

function normalizeDateOrder(value) {
  const dateOrder = String(value || DEFAULTS.dateOrder).trim().toLowerCase();
  return VALID_DATE_ORDERS.has(dateOrder) ? dateOrder : DEFAULTS.dateOrder;
}

export function normalizeSearchParams(paramsOrQuery, legacyLimit = 8) {
  const params =
    typeof paramsOrQuery === "object" && paramsOrQuery !== null
      ? paramsOrQuery
      : {
          ...DEFAULTS,
          q: paramsOrQuery,
          limit: legacyLimit,
        };

  const query = String(params.q || "").trim();
  const limit = clamp(
    toInteger(params.limit, toInteger(legacyLimit, DEFAULTS.limit)),
    1,
    20
  );
  const offset = Math.max(toInteger(params.offset, DEFAULTS.offset), 0);
  const type = normalizeType(params.type);

  return {
    query,
    limit,
    offset,
    type,
    includeCounts: toBoolean(params.includeCounts, DEFAULTS.includeCounts),
    filters: {
      recentOnly: toBoolean(params.recentOnly, DEFAULTS.recentOnly),
      viewedOnly: toBoolean(params.viewedOnly, DEFAULTS.viewedOnly),
      dateOrder: normalizeDateOrder(params.dateOrder),
      location: String(params.location || "").trim(),
    },
  };
}

export default normalizeSearchParams;