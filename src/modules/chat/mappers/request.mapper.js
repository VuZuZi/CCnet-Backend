import { normalizeParticipantIds } from '../utils/participant.util.js';

export function mapCreateConversationRequest(req) {
  return {
    ...req.body,
    participantIds: normalizeParticipantIds(req.body?.participantIds),
  };
}

export function mapUpdateConversationRequest(req) {
  return {
    ...req.body,
    id: req.params?.id,
  };
}

export function mapAddMembersRequest(req) {
  return {
    ...req.body,
    id: req.params?.id,
    participantIds: normalizeParticipantIds(req.body?.participantIds),
  };
}

export function mapRemoveMemberRequest(req) {
  return {
    id: req.params?.id,
    participantIds: [req.params?.participantId],
  };
}

export function mapLeaveConversationRequest(req) {
  return {
    id: req.params?.id,
  };
}

export function mapGetAssetsRequest(req) {
  return {
    id: req.params?.id,
    type: req.query?.type,
    page: req.query?.page,
    limit: req.query?.limit,
  };
}

export function mapGetMessagesRequest(req) {
  return {
    id: req.params?.id,
  };
}

export function extractUploadedMessageFiles(req) {
  const rawFiles = req?.files;
  const singleFile = req?.file;

  const collected = [];

  if (singleFile) {
    collected.push(singleFile);
  }

  if (Array.isArray(rawFiles)) {
    collected.push(...rawFiles.filter(Boolean));
  } else if (rawFiles && typeof rawFiles === 'object') {
    Object.values(rawFiles).forEach((value) => {
      if (Array.isArray(value)) {
        collected.push(...value.filter(Boolean));
      }
    });
  }

  return collected;
}

export function mapSendMessageValidationRequest(req, uploadedFiles = []) {
  const body = req?.body && typeof req.body === 'object' ? req.body : {};

  const {
    files: _files,
    attachments: _attachments,
    ...safeBody
  } = body;

  return {
    ...safeBody,
    attachmentsCount: Array.isArray(uploadedFiles) ? uploadedFiles.length : 0,
  };
}

export function mapSendMessageServicePayload(validatedPayload, attachments, currentUserId) {
  return {
    conversationId: validatedPayload.conversationId,
    text: validatedPayload.text,
    replyTo: validatedPayload.replyTo || null,
    attachments,
    currentUserId,
  };
}

export function mapReactMessageRequest(req) {
  return {
    id: req.params?.id,
    emoji: req.body?.emoji,
  };
}

export function mapUnsendMessageRequest(req) {
  return {
    id: req.params?.id,
  };
}

export function mapMarkAsReadRequest(req) {
  return {
    id: req.params?.id,
  };
}

export function mapDownloadFileRequest(req) {
  return {
    filename: req.params?.filename,
  };
}