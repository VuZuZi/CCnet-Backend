import EventOutbox from '../models/event-outbox.model.js';

class EventOutboxRepository {
    async createMany(eventsData, session = null) {
        if (!eventsData || eventsData.length === 0) return [];
        return await EventOutbox.insertMany(eventsData, { session });
    }

    async findPendingEvents(limit = 50) {
        return await EventOutbox.find({ status: 'PENDING' })
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean()
            .exec();
    }

    async markAsProcessed(ids) {
        if (!ids || ids.length === 0) return;
        return await EventOutbox.updateMany(
            { _id: { $in: ids } },
            { $set: { status: 'PROCESSED' } }
        ).exec();
    }
}

export default EventOutboxRepository;