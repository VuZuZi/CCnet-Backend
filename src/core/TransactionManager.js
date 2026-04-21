import mongoose from 'mongoose';
import AppError from './AppError.js';

class TransactionManager {
    constructor({ eventOutboxRepository, jobQueue }) {
        this.eventOutboxRepository = eventOutboxRepository;
        this.jobQueue = jobQueue;
    }

    async runInTransaction(callback) {
        const session = await mongoose.startSession();
        try {
            let result;
            const outboxEvents = [];

            const dispatchEvent = (eventName, payload) => {
                outboxEvents.push({ eventName, payload });
            };

            await session.withTransaction(async (txSession) => {
                outboxEvents.length = 0;

                result = await callback(txSession, dispatchEvent);

                if (outboxEvents.length > 0) {
                    await this.eventOutboxRepository.createMany(outboxEvents, txSession);
                }
            });

            if (outboxEvents.length > 0 && this.jobQueue) {
                this.jobQueue.addJob('outbox-processor', 'flush-events', {})
                    .catch(e => console.error('[CTO Warning] Lỗi trigger Outbox Worker:', e.message));
            }

            return result;
        } catch (error) {
            throw error;
        } finally {
            await session.endSession();
        }
    }

    static async runInTransaction() {
        throw new AppError('[CTO Strict Policy]: Truy cập static vào TransactionManager bị cấm. Vui lòng inject qua Awilix DI.', 500);
    }
}

export default TransactionManager;