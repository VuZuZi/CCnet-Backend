import { normalizeId, uniqueIds } from './id.util.js';

export function normalizeParticipantIds(items = []) {
  return uniqueIds(items);
}

export function normalizeSocketUserId(value) {
  return normalizeId(value);
}

export function isParticipant(conversation, userId) {
  return (conversation?.participants || []).some(
    (participantId) => normalizeId(participantId) === normalizeId(userId)
  );
}

export function isGroupAdmin(conversation, userId) {
  return (conversation?.groupAdmins || []).some(
    (adminId) => normalizeId(adminId) === normalizeId(userId)
  );
}

export function pickRandomAdminCandidate(participants = []) {
  const arr = Array.isArray(participants) ? participants.filter(Boolean) : [];
  if (!arr.length) return null;

  const index = Math.floor(Math.random() * arr.length);
  return arr[index] || null;
}