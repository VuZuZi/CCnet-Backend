import { Server } from 'socket.io';
import Redis from 'ioredis';

const CHAT_NEW_MESSAGE_CHANNEL = 'chat:message:new';

const SOCKET_EVENTS = {
  MESSAGE_NEW: 'chat:message:new',
  NOTIFY: 'chat:notify',
  USER_JOIN: 'user:join',
  JOIN: 'join',
  LEAVE: 'leave'
};

export function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: 'http://localhost:3000', credentials: true }
  });

  const sub = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined
  });

  sub.on('error', (e) => console.error('[redis:sub] error', e));
  sub.on('connect', () => console.log('[redis:sub] connected'));
  sub.on('ready', () => console.log('[redis:sub] ready'));

  sub.subscribe(CHAT_NEW_MESSAGE_CHANNEL, (err, count) => {
    if (err) console.error('[redis:sub] subscribe failed', err);
    else console.log('[redis:sub] subscribed:', CHAT_NEW_MESSAGE_CHANNEL, 'count=', count);
  });

  sub.on('message', (_channel, raw) => {
    try {
      const parsed = JSON.parse(raw);

      const conversationId = parsed?.conversationId;
      const message = parsed?.message;
      const participantIds = parsed?.participantIds;

      if (!conversationId || !message) {
        console.warn('[redis:sub] invalid payload:', parsed);
        return;
      }

      const cid = String(conversationId);
      const payload = { conversationId: cid, message };

      io.to(cid).emit(SOCKET_EVENTS.MESSAGE_NEW, payload);

      if (Array.isArray(participantIds)) {
        for (const uid of participantIds) {
          io.to(`user:${String(uid)}`).emit(SOCKET_EVENTS.NOTIFY, payload);
        }
      }

      console.log('[socket emit] cid=', cid, 'mid=', message?._id);
    } catch (e) {
      console.error('[redis:sub] parse error', e);
    }
  });

  io.on('connection', (socket) => {
    console.log('[socket] connected', socket.id);

    socket.on(SOCKET_EVENTS.USER_JOIN, (userId, ack) => {
      if (!userId) return;
      const room = `user:${String(userId)}`;
      socket.join(room);
      ack?.({ ok: true, room });
      console.log('[socket] user join', room);
    });

    socket.on(SOCKET_EVENTS.JOIN, (conversationId, ack) => {
      const room = String(conversationId);
      socket.join(room);
      ack?.({ ok: true, room });
      console.log('[socket] join room', room);
    });

    socket.on(SOCKET_EVENTS.LEAVE, (conversationId) => {
      const room = String(conversationId);
      socket.leave(room);
      console.log('[socket] leave room', room);
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', socket.id, reason);
    });
  });

  return io;
}
