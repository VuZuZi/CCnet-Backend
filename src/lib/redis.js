// src/lib/redis.js
// Mock Redis - không kết nối thật
export default {
    get: async () => null,
    set: async () => true,
    del: async () => true,
    publish: async () => true,
    subscribe: async () => true,
    on: () => {},
    quit: async () => {},
};