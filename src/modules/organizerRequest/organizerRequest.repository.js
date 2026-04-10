import OrganizerRequest from './organizerRequest.model.js';
import { ORGANIZER_REQUEST_STATUS } from './organizerRequest.constant.js';

class OrganizerRequestRepository {
  async create(payload, session = null) {
    const options = session ? { session } : {};
    const docs = await OrganizerRequest.create([payload], options);
    return docs[0].toObject();
  }

  async findPendingByUserId(userId) {
    return OrganizerRequest.findOne({
      userId,
      status: ORGANIZER_REQUEST_STATUS.PENDING,
    })
      .lean()
      .exec();
  }

  async findLatestByUserId(userId) {
    return OrganizerRequest.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findById(id) {
    return OrganizerRequest.findById(id)
      .populate('userId', 'fullName email avatar role phone location')
      .populate('reviewedBy', 'fullName email avatar role')
      .lean()
      .exec();
  }

  async updateById(id, updateData, session = null) {
    const options = { new: true, runValidators: true };
    if (session) options.session = session;

    return OrganizerRequest.findByIdAndUpdate(
      id,
      { $set: updateData },
      options
    )
      .populate('userId', 'fullName email avatar role phone location')
      .populate('reviewedBy', 'fullName email avatar role')
      .lean()
      .exec();
  }

  async listForAdmin({ page = 1, limit = 10, search = '', status = '' }) {
    try {
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
      const skip = (safePage - 1) * safeLimit;

      const filter = {};

      if (status) {
        filter.status = String(status).toUpperCase();
      }

      if (search?.trim()) {
        const keyword = search.trim();
        filter.$or = [
          { fullNameSnapshot: { $regex: keyword, $options: 'i' } },
          { emailSnapshot: { $regex: keyword, $options: 'i' } },
          { organizationName: { $regex: keyword, $options: 'i' } },
          { bankAccountName: { $regex: keyword, $options: 'i' } },
        ];
      }

      console.log('[OrganizerRequestRepository] filter =', filter);
      console.log('[OrganizerRequestRepository] page/limit/skip =', safePage, safeLimit, skip);

      const [items, total] = await Promise.all([
        OrganizerRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .select(
            'fullNameSnapshot emailSnapshot organizationName status submittedAt reviewedAt reviewReason createdAt'
          )
          .lean()
          .exec(),
        OrganizerRequest.countDocuments(filter),
      ]);

      console.log('[OrganizerRequestRepository] items length =', items.length, 'total =', total);

      return {
        items,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit) || 1,
        },
      };
    } catch (error) {
      console.error('[OrganizerRequestRepository] listForAdmin error =', error);
      throw error;
    }
  }

  async findActivePipelineByUserId(userId) {
    return OrganizerRequest.findOne({
      userId,
      status: {
        $in: [
          ORGANIZER_REQUEST_STATUS.DRAFT_SUBMITTED,
          ORGANIZER_REQUEST_STATUS.SYSTEM_CHECKING,
          ORGANIZER_REQUEST_STATUS.AWAITING_MICRO_DEPOSIT,
          ORGANIZER_REQUEST_STATUS.PENDING,
        ],
      },
    })
      .lean()
      .exec();
  }
}

export default OrganizerRequestRepository;