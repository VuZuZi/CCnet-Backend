import mongoose from 'mongoose';

class TransactionManager {
  async runInTransaction(callback) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async (txSession) => {
        result = await callback(txSession);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  static async runInTransaction(callback) {
    console.warn('[CTO Warning]: Calling TransactionManager statically is deprecated. Please inject via DI.');
    const manager = new TransactionManager();
    return await manager.runInTransaction(callback);
  }
}

export default TransactionManager;