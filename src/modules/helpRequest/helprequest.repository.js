import HelpRequest from './helprequest.model.js';

const CLUSTER_SWITCH_ZOOM = 11;

const buildBoundsQuery = ({ north, south, east, west }) => ({
  isDeleted: false,
  'location.coordinates.0': { $gte: west, $lte: east },
  'location.coordinates.1': { $gte: south, $lte: north },
});

const buildPublicMapStatusQuery = () => ({
  $in: ['VERIFIED', 'IN_PROGRESS', 'COMPLETED'],
});

const escapeRegExp = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    const updated = await HelpRequest.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
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

  async findMapItems(params = {}) {
    const {
      north,
      south,
      east,
      west,
      zoom = 6,
      category,
      urgencyLevel,
      search,
      includePrivate = false,
      limit = 500,
    } = params;

    const filter = buildBoundsQuery({ north, south, east, west });

    if (!includePrivate) {
      filter.status = buildPublicMapStatusQuery();
    }

    if (category) {
      filter.category = category;
    }

    if (urgencyLevel) {
      filter.urgencyLevel = urgencyLevel;
    }

    if (search) {
      const regex = new RegExp(escapeRegExp(search.trim()), 'i');
      filter.$or = [
        { title: regex },
        { story: regex },
        { 'location.address': regex },
      ];
    }

    const items = await HelpRequest.find(filter)
      .select({
        title: 1,
        story: 1,
        category: 1,
        urgencyLevel: 1,
        status: 1,
        amountNeeded: 1,
        location: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1 })
      .limit(Math.max(50, Math.min(Number(limit) || 500, 2000)))
      .lean()
      .exec();

    if (Number(zoom) >= CLUSTER_SWITCH_ZOOM) {
      return {
        mode: 'item',
        items,
      };
    }

    const latStep = zoom <= 5 ? 1.8 : zoom <= 7 ? 0.9 : zoom <= 9 ? 0.45 : 0.2;
    const lngStep = zoom <= 5 ? 1.8 : zoom <= 7 ? 0.9 : zoom <= 9 ? 0.45 : 0.2;

    const bucketMap = new Map();

    for (const item of items) {
      const coordinates = item?.location?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;

      const [lng, lat] = coordinates.map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const latBucket = Math.floor(lat / latStep);
      const lngBucket = Math.floor(lng / lngStep);
      const key = `${latBucket}:${lngBucket}`;

      const existing = bucketMap.get(key);

      if (!existing) {
        bucketMap.set(key, {
          type: 'cluster',
          clusterId: `cluster-${key}`,
          gridKey: key,
          latitude: lat,
          longitude: lng,
          count: 1,
          sampleCategory: item.category || 'KHAC',
          sampleTitle: item.title || '',
          sampleAddress: item?.location?.address || '',
          expandZoom: Math.min(Number(zoom) + 2, CLUSTER_SWITCH_ZOOM),
        });
        continue;
      }

      existing.count += 1;
      existing.latitude = (existing.latitude * (existing.count - 1) + lat) / existing.count;
      existing.longitude = (existing.longitude * (existing.count - 1) + lng) / existing.count;
    }

    return {
      mode: 'cluster',
      items: Array.from(bucketMap.values()).sort((a, b) => b.count - a.count),
      panelItems: items,
    };
  }
}