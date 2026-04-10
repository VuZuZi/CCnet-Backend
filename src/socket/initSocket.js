import Redis from 'ioredis';
import { Server } from 'socket.io';
import { normalizeSocketUserId } from '../modules/chat/utils/participant.util.js';

const CHAT_CHANNELS = {
  MESSAGE_NEW: 'chat:message:new',
  MESSAGE_UPDATED: 'chat:message:updated',
  MESSAGE_READ: 'chat:message:read',
  CONVERSATION_UPDATED: 'chat:conversation:updated',
  MESSAGE_PINNED: 'chat:message:pinned',
  MESSAGE_UNPINNED: 'chat:message:unpinned',
};

const SOCKET_EVENTS = {
  MESSAGE_NEW: 'chat:message:new',
  MESSAGE_UPDATED: 'chat:message:updated',
  MESSAGE_READ: 'chat:message:read',
  CONVERSATION_UPDATED: 'chat:conversation:updated',
  MESSAGE_PINNED: 'chat:message:pinned',
  MESSAGE_UNPINNED: 'chat:message:unpinned',
  NOTIFY: 'chat:notify',
  USER_JOIN: 'user:join',
  JOIN: 'join',
  LEAVE: 'leave',
};

const CHANNEL_EVENT_MAP = {
  [CHAT_CHANNELS.MESSAGE_NEW]: SOCKET_EVENTS.MESSAGE_NEW,
  [CHAT_CHANNELS.MESSAGE_UPDATED]: SOCKET_EVENTS.MESSAGE_UPDATED,
  [CHAT_CHANNELS.MESSAGE_READ]: SOCKET_EVENTS.MESSAGE_READ,
  [CHAT_CHANNELS.CONVERSATION_UPDATED]: SOCKET_EVENTS.CONVERSATION_UPDATED,
  [CHAT_CHANNELS.MESSAGE_PINNED]: SOCKET_EVENTS.MESSAGE_PINNED,
  [CHAT_CHANNELS.MESSAGE_UNPINNED]: SOCKET_EVENTS.MESSAGE_UNPINNED,
};

function emitToUserRooms(io, participantIds, eventName, payload) {
  if (!Array.isArray(participantIds) || !eventName) return;

  for (const rawUserId of participantIds) {
    const userId = normalizeSocketUserId(rawUserId);
    if (!userId) continue;

    io.to(`user:${userId}`).emit(eventName, payload);
  }
}

function subscribeChatChannels(redisSubscriber) {
  return redisSubscriber.subscribe(...Object.keys(CHANNEL_EVENT_MAP));
}

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000',
      credentials: true,
    },
  });

  const subscriber = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });

  subscribeChatChannels(subscriber);

  subscriber.on('message', (channel, rawMessage) => {
    try {
      const payload = JSON.parse(rawMessage);
      const eventName = CHANNEL_EVENT_MAP[channel];

      if (!eventName) return;

      emitToUserRooms(io, payload?.participantIds, eventName, payload);
    } catch (error) {
      console.error('[socket redis message parse failed]', error);
    }
  });

  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.USER_JOIN, (userId, ack) => {
      const normalizedUserId = normalizeSocketUserId(userId);

      if (normalizedUserId) {
        socket.join(`user:${normalizedUserId}`);
      }

      ack?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.JOIN, (conversationId, ack) => {
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
      }

      ack?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.LEAVE, (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });
  });

  return io;
}