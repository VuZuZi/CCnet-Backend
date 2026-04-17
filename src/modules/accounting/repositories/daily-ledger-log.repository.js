import DailyLedgerLog from '../models/daily-ledger-log.model.js';

class DailyLedgerLogRepository {
    async upsertLogForDate(dateString, data, session = null) {
        const startOfDay = new Date(`${dateString}T00:00:00.000+07:00`);

        return await DailyLedgerLog.findOneAndUpdate(
            { recordDate: startOfDay },
            { $set: data },
            { new: true, upsert: true, setDefaultsOnInsert: true, session, runValidators: true }
        ).lean().exec();
    }

    async getLatestLogBefore(targetDateString, session = null) {
        const targetDate = new Date(`${targetDateString}T00:00:00.000+07:00`);
        return await DailyLedgerLog.findOne({ recordDate: { $lt: targetDate } })
            .sort({ recordDate: -1 })
            .session(session)
            .lean()
            .exec();
    }

    async findLogs({ skip = 0, limit = 30, status = 'ALL' }) {
        const query = status !== 'ALL' ? { status } : {};
        const [logs, total] = await Promise.all([
            DailyLedgerLog.find(query).sort({ recordDate: -1 }).skip(skip).limit(limit).lean().exec(),
            DailyLedgerLog.countDocuments(query).exec()
        ]);
        return { logs, total };
    }
}
export default DailyLedgerLogRepository;