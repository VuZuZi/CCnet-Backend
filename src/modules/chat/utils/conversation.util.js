import { normalizeParticipantIds } from './participant.util.js';

export function getConversationUnreadCountsMap(conversation) {
  const unreadCounts = conversation?.unreadCounts;

  if (unreadCounts instanceof Map) return unreadCounts;

  if (unreadCounts && typeof unreadCounts?.set === 'function') {
    return unreadCounts;
  }

  return new Map(Object.entries(unreadCounts || {}));
}

export function buildUnreadCounts(participantIds = []) {
  const ids = normalizeParticipantIds(participantIds);
  return Object.fromEntries(ids.map((id) => [String(id), 0]));
}

export async function saveConversationDocument(
  conversationRepository,
  conversation,
  { touchUpdatedAt = false } = {}
) {
  if (touchUpdatedAt) {
    conversation.updatedAt = new Date();
  }

  await conversationRepository.save(conversation);
  return conversation;
}