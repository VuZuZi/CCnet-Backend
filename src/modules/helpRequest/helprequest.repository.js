import HelpRequest from './helprequest.model.js';

export default class HelpRequestRepository {
  async create(data) {
    const helpRequest = new HelpRequest(data);
    return helpRequest.save();
  }

  async findById(id, options = {}) {
    const query = HelpRequest.findById(id);

    if (options.populate) {
      if (options.populate.includes('requester')) {
        query.populate('requesterId', 'fullName avatar email');
      }
      if (options.populate.includes('verifier')) {
        query.populate('verifiedBy', 'fullName avatar');
      }
      if (options.populate.includes('assignedOrganizer')) {
        query.populate('assignedOrganizerId', 'fullName avatar email');
      }
      if (options.populate.includes('linkedProject')) {
        query.populate('linkedProjectId', 'title status');
      }
    }

    return query.exec();
  }

  async findOne(filter, options = {}) {
    const query = HelpRequest.findOne(filter);

    if (options.populate) {
      if (options.populate.includes('requester')) {
        query.populate('requesterId', 'fullName avatar email');
      }
    }

    return query.exec();
  }

  async findMany(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      populate = [],
      select,
    } = options;
    console.log(`[REPO-FIND] Query filter:`, filter);

    const skip = (page - 1) * limit;
    const query = HelpRequest.find(filter);

    if (select) {
      query.select(select);
    }

    if (populate.includes('requester')) {
      query.populate('requesterId', 'fullName avatar');
    }
    if (populate.includes('assignedOrganizer')) {
      query.populate('assignedOrganizerId', 'fullName avatar');
    }

    query.sort(sort).skip(skip).limit(limit);

    const [data, total] = await Promise.all([
      query.exec(),
      HelpRequest.countDocuments(filter),
    ]);
    console.log(`[REPO-FIND] Query result:`, { total, returned: data.length });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findByRequester(requesterId, options = {}) {
    const filter = { requesterId, isDeleted: false };
    return this.findMany(filter, options);
  }

  async updateById(id, updateData) {
    console.log(`[REPO] Updating HelpRequest:`, { id: id.toString(), updateData });

    const updated = await HelpRequest.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    console.log(`[REPO] Update result:`, {
      id: updated?._id?.toString(),
      assignedOrganizerId: updated?.assignedOrganizerId?.toString(),
      status: updated?.status,
    });

    return updated;
  }

  async softDelete(id) {
    return HelpRequest.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
  }

  async hardDelete(id) {
    return HelpRequest.findByIdAndDelete(id);
  }

  async countByStatus(status) {
    return HelpRequest.countDocuments({ status, isDeleted: false });
  }

  async getStats() {
    const stats = await HelpRequest.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    return stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
  }

  async findNearby(coordinates, maxDistance = 50000, options = {}) {
    const filter = {
      isDeleted: false,
      status: { $in: ['PENDING', 'VERIFIED', 'IN_PROGRESS'] },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates,
          },
          $maxDistance: maxDistance,
        },
      },
    };

    return this.findMany(filter, options);
  }

  async findUrgent(options = {}) {
    const filter = {
      isDeleted: false,
      status: { $in: ['PENDING', 'VERIFIED'] },
      urgencyLevel: { $in: ['HIGH', 'CRITICAL'] },
    };

    return this.findMany(filter, {
      ...options,
      sort: { urgencyLevel: -1, createdAt: -1 },
    });
  }
}
