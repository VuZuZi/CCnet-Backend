import OrganizerRequest from './organizerRequest.model.js';

class OrganizerRequestRepository {
  async create(payload) {
    return OrganizerRequest.create(payload);
  }

  async findPendingByUserId(userId) {
    return OrganizerRequest.findOne({
      userId,
      status: 'PENDING',
    }).lean().exec();
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

  async updateById(id, updateData) {
    return OrganizerRequest.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('userId', 'fullName email avatar role phone location')
      .populate('reviewedBy', 'fullName email avatar role')
      .lean()
      .exec();
  }

  async listForAdmin({ page = 1, limit = 10, search = '', status = '' }) {
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

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }
}

export default OrganizerRequestRepository;