import AppError from '../../../../core/AppError.js';
import { isGroupAdmin, isParticipant } from '../../utils/participant.util.js';

export async function requireConversationParticipant(
  conversationRepository,
  conversationId,
  currentUserId
) {
  const conversation = await conversationRepository.findById(conversationId);

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  if (!isParticipant(conversation, currentUserId)) {
    throw new AppError('You are not a participant of this conversation', 403);
  }

  return conversation;
}

export function requireGroupConversation(conversation) {
  if (String(conversation?.type || '') !== 'group') {
    throw new AppError('Only group conversation is supported for this action', 400);
  }

  return conversation;
}

export function requireGroupAdmin(conversation, currentUserId) {
  if (!isGroupAdmin(conversation, currentUserId)) {
    throw new AppError('Only group admins can update this conversation', 403);
  }

  return conversation;
}