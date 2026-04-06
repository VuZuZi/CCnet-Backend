class SimpleEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    const current = this.listeners.get(eventName) || [];
    current.push(handler);
    this.listeners.set(eventName, current);
  }

  async emit(eventName, payload) {
    const handlers = this.listeners.get(eventName) || [];
    await Promise.allSettled(handlers.map((handler) => handler(payload)));
  }
}

let sharedEventBus = null;

export function createEventBus(customBus = null) {
  if (customBus && typeof customBus.on === 'function' && typeof customBus.emit === 'function') {
    return customBus;
  }

  return new SimpleEventBus();
}

export function getSharedEventBus() {
  if (!sharedEventBus) {
    sharedEventBus = createEventBus();
  }

  return sharedEventBus;
}

export function setSharedEventBus(customBus) {
  if (!customBus || typeof customBus.on !== 'function' || typeof customBus.emit !== 'function') {
    throw new Error('setSharedEventBus requires a valid event bus');
  }

  sharedEventBus = customBus;
  return sharedEventBus;
}

export { SimpleEventBus };