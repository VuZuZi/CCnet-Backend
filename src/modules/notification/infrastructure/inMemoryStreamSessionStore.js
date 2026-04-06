export class InMemoryStreamSessionStore {
  constructor() {
    this.sessions = new Map();
    this.cleanupTimer = null;
  }

  set(token, value, ttlMs) {
    const expiresAt = Date.now() + ttlMs;

    this.sessions.set(token, {
      ...value,
      expiresAt,
    });

    this.ensureCleanup();

    return {
      ...value,
      expiresAt,
    };
  }

  consume(token) {
    const session = this.sessions.get(token);
    if (!session) return null;

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    this.sessions.delete(token);
    return session;
  }

  ensureCleanup() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [token, session] of this.sessions.entries()) {
        if (session.expiresAt <= now) {
          this.sessions.delete(token);
        }
      }

      if (this.sessions.size === 0) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, 30000);
  }
}