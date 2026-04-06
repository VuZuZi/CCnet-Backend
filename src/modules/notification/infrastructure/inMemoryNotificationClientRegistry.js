export class InMemoryNotificationClientRegistry {
  constructor() {
    this.clientsByUserId = new Map();
  }

  add(userId, client) {
    const normalizedUserId = String(userId);
    const currentClients = this.clientsByUserId.get(normalizedUserId) || [];
    currentClients.push(client);
    this.clientsByUserId.set(normalizedUserId, currentClients);
    return client;
  }

  remove(userId, clientId) {
    const normalizedUserId = String(userId);
    const currentClients = this.clientsByUserId.get(normalizedUserId) || [];
    const nextClients = currentClients.filter((item) => item.id !== clientId);

    if (nextClients.length === 0) {
      this.clientsByUserId.delete(normalizedUserId);
    } else {
      this.clientsByUserId.set(normalizedUserId, nextClients);
    }
  }

  getByUserId(userId) {
    return this.clientsByUserId.get(String(userId)) || [];
  }

  getAll() {
    return this.clientsByUserId;
  }

  getTotalClients() {
    let total = 0;
    for (const clients of this.clientsByUserId.values()) {
      total += clients.length;
    }
    return total;
  }
}