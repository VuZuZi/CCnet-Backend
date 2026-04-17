import WebhookAuditLog from '../models/webhook-audit-log.model.js';

class WebhookAuditLogRepository {
    async createLog(data, session = null) {
        const docs = await WebhookAuditLog.create([data], { session });
        return docs[0];
    }

    async updateStatus(id, status, updatePayload = {}, session = null) {
        return await WebhookAuditLog.findByIdAndUpdate(
            id,
            { $set: { status, ...updatePayload } },
            { new: true, session }
        ).lean().exec();
    }

    async findUnprocessedLogs(provider = 'SEPAY', limit = 50) {
        return await WebhookAuditLog.find({ provider, status: 'RECEIVED' })
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean()
            .exec();
    }
}

export default WebhookAuditLogRepository;