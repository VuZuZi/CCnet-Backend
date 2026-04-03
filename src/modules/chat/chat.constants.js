export const CHAT_CONVERSATION_TYPES = {
  DIRECT: 'direct',
  GROUP: 'group',
};

export const CHAT_MESSAGE_TYPES = {
  USER: 'user',
  SYSTEM: 'system',
};

export const CHAT_MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  SEEN: 'seen',
};

export const CHAT_ASSET_TYPES = {
  IMAGE: 'image',
  FILE: 'file',
  LINK: 'link',
};

export const CHAT_GROUP_EVENT_KIND = 'group_event';

export const CHAT_GROUP_ACTIONS = {
  MEMBER_ADDED: 'member_added',
  MEMBER_REMOVED: 'member_removed',
  MEMBER_LEFT: 'member_left',
  ADMIN_TRANSFERRED: 'admin_transferred',
  GROUP_NAME_UPDATED: 'group_name_updated',
};

export const CHAT_EVENTS = {
  MESSAGE_NEW: 'chat:message:new',
  MESSAGE_UPDATED: 'chat:message:updated',
  MESSAGE_READ: 'chat:message:read',
  CONVERSATION_UPDATED: 'chat:conversation:updated',
  NOTIFY: 'chat:notify',
  USER_JOIN: 'user:join',
  JOIN: 'join',
  LEAVE: 'leave',
};

export const CHAT_CHANNELS = {
  NEW_MESSAGE: CHAT_EVENTS.MESSAGE_NEW,
  UPDATED_MESSAGE: CHAT_EVENTS.MESSAGE_UPDATED,
  MESSAGE_READ: CHAT_EVENTS.MESSAGE_READ,
  CONVERSATION_UPDATED: CHAT_EVENTS.CONVERSATION_UPDATED,
};