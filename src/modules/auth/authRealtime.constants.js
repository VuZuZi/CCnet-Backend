export const AUTH_REALTIME_CHANNELS = Object.freeze({
  USER_STATUS_CHANGED: "auth:user:status-changed",
});

export const AUTH_REALTIME_EVENTS = Object.freeze({
  USER_BANNED: "auth:user:banned",
  USER_STATUS_CHANGED: "auth:user:status-changed",
});

export const getAuthBannedUserKey = (userId) =>
  `auth:user:${String(userId || "").trim()}:banned`;
