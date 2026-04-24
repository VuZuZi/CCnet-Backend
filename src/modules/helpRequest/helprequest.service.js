import AppError from '../../core/AppError.js';
import User from '../user/user.model.js';

const toRadians = (value) => (value * Math.PI) / 180;
const normalizeRole = (role = '') => role.toString().trim().toLowerCase();

const PUBLIC_VISIBLE_STATUSES = ['VERIFIED', 'IN_PROGRESS', 'COMPLETED'];
const ASSIGNABLE_STATUSES = ['VERIFIED', 'IN_PROGRESS'];
const MAP_PANEL_LIMIT = 50;

const parseCoordinates = (value) => {
  if (!value) return null;

  if (Array.isArray(value) && value.length === 2) {
    const [lng, lat] = value.map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.coordinates) && value.coordinates.length === 2) {
      const [lng, lat] = value.coordinates.map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }

    if (Number.isFinite(Number(value.lng)) && Number.isFinite(Number(value.lat))) {
      return [Number(value.lng), Number(value.lat)];
    }
  }

  if (typeof value === 'string') {
    const match = value
      .trim()
      .match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);

    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }
  }

  return null;
};

const getDistanceKm = (origin, target) => {
  if (!origin || !target) return null;

  const [originLng, originLat] = origin;
  const [targetLng, targetLat] = target;

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(targetLat - originLat);
  const deltaLng = toRadians(targetLng - originLng);
  const lat1 = toRadians(originLat);
  const lat2 = toRadians(targetLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const scoreDistance = (distanceKm) => {
  if (!Number.isFinite(distanceKm)) return 0;
  if (distanceKm <= 5) return 35;
  if (distanceKm <= 20) return 25;
  if (distanceKm <= 50) return 15;
  if (distanceKm <= 100) return 8;
  return 2;
};

const normalizeText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().toLowerCase();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join(' ');
  }

  if (typeof value === 'object') {
    return [
      value.address,
      value.fullAddress,
      value.name,
      value.ward,
      value.district,
      value.city,
      value.province,
      value.country,
      value.description,
    ]
      .map(normalizeText)
      .filter(Boolean)
      .join(' ');
  }

  return '';
};

const normalizeLocationText = (location) => {
  if (!location) return '';

  if (typeof location === 'string') {
    return normalizeText(location);
  }

  if (typeof location === 'object') {
    return normalizeText({
      address: location.address,
      fullAddress: location.fullAddress,
      name: location.name,
      ward: location.ward,
      district: location.district,
      city: location.city,
      province: location.province,
      country: location.country,
      description: location.description,
    });
  }

  return normalizeText(location);
};

const scoreRelevance = (helpRequest, organizer) => {
  const requestAddress = normalizeLocationText(helpRequest?.location);
  const organizerLocation = normalizeLocationText(organizer?.location);
  const requestCategory = normalizeText(helpRequest?.category);

  const profileText = normalizeText([
    organizer?.headline,
    organizer?.about,
    ...(Array.isArray(organizer?.skills) ? organizer.skills : []),
  ]);

  let score = 0;

  if (requestCategory && profileText.includes(requestCategory)) {
    score += 30;
  }

  if (requestAddress && organizerLocation) {
    if (requestAddress === organizerLocation) {
      score += 25;
    } else if (
      requestAddress.includes(organizerLocation) ||
      organizerLocation.includes(requestAddress)
    ) {
      score += 15;
    }
  }

  return score;
};

const buildViewerContext = (viewer = null) => {
  const role = normalizeRole(viewer?.role || '');
  return {
    id: viewer?.userId || viewer?.id || null,
    role,
    isAdmin: role === 'admin',
    isOrganizer: role === 'organizer',
    isAuthenticated: Boolean(viewer?.userId || viewer?.id),
  };
};

const normalizeBounds = (filters = {}) => {
  const north = Number(filters.north);
  const south = Number(filters.south);
  const east = Number(filters.east);
  const west = Number(filters.west);

  if (
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west)
  ) {
    return null;
  }

  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
};

const isPointWithinBounds = (lng, lat, bounds) => {
  if (!bounds) return true;
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
};

const getMapClusterCellSize = (zoom) => {
  if (zoom >= 16) return 0;
  if (zoom >= 14) return 0.015;
  if (zoom >= 12) return 0.03;
  if (zoom >= 10) return 0.06;
  if (zoom >= 8) return 0.12;
  if (zoom >= 7) return 0.2;
  if (zoom >= 6) return 0.35;
  if (zoom >= 5) return 0.6;
  return 1.2;
};

const getExpandZoom = (zoom) => {
  return Math.min(Math.max(Number(zoom || 6) + 2, 8), 18);
};

const buildClusterKey = (lng, lat, cellSize) => {
  const lngBucket = Math.floor(lng / cellSize);
  const latBucket = Math.floor(lat / cellSize);
  return `${lngBucket}:${latBucket}`;
};

const mapHelpRequestItem = (item) => {
  const coordinates = parseCoordinates(item?.location?.coordinates || item?.coordinates);
  if (!coordinates) return null;

  return {
    id: String(item._id || item.id || ''),
    title: item.title || 'Yêu cầu trợ giúp',
    story: item.story || '',
    category: item.category || 'KHAC',
    urgencyLevel: item.urgencyLevel || 'MEDIUM',
    status: item.status || '',
    address: item.location?.address || item.address || 'Chưa có địa điểm cụ thể',
    amountNeeded: Number(item.amountNeeded || 0),
    coordinates,
    createdAt: item.createdAt || null,
  };
};

const buildMapSummary = ({ mode, zoom, items, clusters }) => ({
  totalVisible: Number(items.length),
  itemCount: Number(items.length),
  clusterCount: Number(clusters.length),
  requestCount: Number(items.length),
  zoom: Number(zoom || 6),
});

export default class HelpRequestService {
    constructor({
    helprequestRepository,
    cloudinaryProvider,
    transactionManager,
    userRepository,
    notificationRepository,
    notificationService = null,
    adminActionLogRepository,
  }) {
    this.helpRequestRepository = helprequestRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.transactionManager = transactionManager;
    this.userRepository = userRepository;
    this.notificationRepository = notificationRepository;
    this.notificationService = notificationService;
    this.adminActionLogRepository = adminActionLogRepository;
  }

  async logAdminHelpRequestAction({
    actorId,
    actorRole = 'admin',
    targetId,
    action,
    reason = '',
    previousState = null,
    nextState = null,
    metadata = null,
  }) {
    if (!this.adminActionLogRepository || !actorId || !targetId || !action) {
      return null;
    }

    return this.adminActionLogRepository.createAdminActionLog({
      actorId,
      actorRole,
      targetType: 'help_request',
      targetId,
      action,
      reason: String(reason || '').trim(),
      previousState,
      nextState,
      metadata,
    });
  }

  async createHelpRequest(userId, data) {
    const helpRequestData = {
      ...data,
      requesterId: userId,
      status: 'VERIFIED',
      verifiedBy: null,
      verifiedAt: null,
      rejectionReason: null,
      assignedByAdminId: null,
      assignedOrganizerId: null,
      assignedAt: null,
      linkedProjectId: null,
    };

    const helpRequest = await this.helpRequestRepository.create(helpRequestData);

    return this.helpRequestRepository.findById(helpRequest._id, {
      populate: ['requester'],
    });
  }

  async getHelpRequests(filters = {}, options = {}) {
    const {
      status,
      category,
      urgencyLevel,
      search,
      requesterId,
      assignedOrganizerId,
    } = filters;

    const viewer = buildViewerContext(options.viewer);
    const query = { isDeleted: false };

    if (status) {
      query.status = status;
    } else if (!viewer.isAdmin) {
      query.status = { $in: PUBLIC_VISIBLE_STATUSES };
    }

    if (category) {
      query.category = category;
    }

    if (urgencyLevel) {
      query.urgencyLevel = urgencyLevel;
    }

    if (requesterId) {
      query.requesterId = requesterId;
    }

    if (assignedOrganizerId) {
      query.assignedOrganizerId = assignedOrganizerId;
    }

    if (search) {
      const keyword = String(search).trim();
      const regex = { $regex: keyword, $options: 'i' };

      const matchedRequesters = await User.find({
        $or: [{ fullName: regex }, { email: regex }, { username: regex }],
      })
        .select('_id')
        .lean()
        .exec();

      const requesterIds = matchedRequesters.map((user) => user._id);

      query.$or = [
        { title: regex },
        { story: regex },
        { 'location.address': regex },
        ...(requesterIds.length ? [{ requesterId: { $in: requesterIds } }] : []),
      ];
    }

    return this.helpRequestRepository.findMany(query, {
      ...options,
      populate: ['requester', 'assignedOrganizer'],
    });
  }

  async getMyHelpRequests(userId, filters = {}, options = {}) {
    return this.getHelpRequests(
      { ...filters, requesterId: userId },
      { ...options, viewer: { userId, role: 'user' } }
    );
  }

  async getHelpRequestById(id, viewer = null) {
    const helpRequest = await this.helpRequestRepository.findById(id, {
      populate: ['requester', 'verifier', 'assignedOrganizer', 'linkedProject'],
    });

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    const context = buildViewerContext(viewer);

    if (context.isAdmin) {
      return helpRequest;
    }

    if (PUBLIC_VISIBLE_STATUSES.includes(helpRequest.status)) {
      return helpRequest;
    }

    const requesterId = helpRequest.requesterId?._id || helpRequest.requesterId;
    const assignedOrganizerId =
      helpRequest.assignedOrganizerId?._id || helpRequest.assignedOrganizerId;

    const canViewPrivate =
      context.id &&
      (String(requesterId) === String(context.id) ||
        String(assignedOrganizerId) === String(context.id));

    if (canViewPrivate) {
      return helpRequest;
    }

    throw new AppError('Help request not found', 404);
  }

  async updateHelpRequest(id, userId, updateData) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (helpRequest.requesterId.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to update this help request', 403);
    }

    if (!['VERIFIED'].includes(helpRequest.status)) {
      throw new AppError('Cannot update help request in current status', 400);
    }

    const allowedUpdates = [
      'title',
      'story',
      'category',
      'location',
      'urgencyLevel',
      'amountNeeded',
      'evidences',
      'contactPhone',
      'contactEmail',
    ];

    const filteredData = {};
    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        filteredData[key] = updateData[key];
      }
    }

    const updated = await this.helpRequestRepository.updateById(id, filteredData);

    return this.helpRequestRepository.findById(updated._id, {
      populate: ['requester'],
    });
  }

  async deleteHelpRequest(id, userId) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (helpRequest.requesterId.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to delete this help request', 403);
    }

    if (!['VERIFIED', 'CANCELLED'].includes(helpRequest.status)) {
      throw new AppError('Cannot delete help request in current status', 400);
    }

    if (helpRequest.evidences?.length > 0) {
      const publicIds = helpRequest.evidences
        .filter((evidence) => evidence.publicId)
        .map((evidence) => evidence.publicId);

      if (publicIds.length > 0) {
        await this.cloudinaryProvider.deleteMany(publicIds);
      }
    }

    return this.helpRequestRepository.softDelete(id);
  }

  async cancelHelpRequest(id, userId) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (helpRequest.requesterId.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to cancel this help request', 403);
    }

    if (['COMPLETED', 'CANCELLED'].includes(helpRequest.status)) {
      throw new AppError('Cannot cancel help request in current status', 400);
    }

    return this.helpRequestRepository.updateById(id, { status: 'CANCELLED' });
  }

  async assignOrganizer(id, adminId, organizerId) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (!ASSIGNABLE_STATUSES.includes(helpRequest.status)) {
      throw new AppError('Help request must be verified before assigning organizer', 400);
    }

    const organizer = await this.userRepository.findById(organizerId);

    if (!organizer) {
      throw new AppError('Organizer not found', 404);
    }

    if (normalizeRole(organizer.role) !== 'organizer') {
      throw new AppError('Selected user is not an organizer', 400);
    }

    const wasAssignedBefore = Boolean(helpRequest.assignedOrganizerId);

    const previousState = {
      status: helpRequest.status || null,
      assignedByAdminId: helpRequest.assignedByAdminId || null,
      assignedOrganizerId: helpRequest.assignedOrganizerId || null,
      assignedAt: helpRequest.assignedAt || null,
    };

    const updateData = {
      assignedByAdminId: adminId,
      assignedOrganizerId: organizerId,
      assignedAt: new Date(),
      status: 'VERIFIED',
    };

    const updatedHelpRequest = await this.helpRequestRepository.updateById(id, updateData);

    await this.logAdminHelpRequestAction({
      actorId: adminId,
      actorRole: 'admin',
      targetId: updatedHelpRequest._id,
      action: wasAssignedBefore ? 'HELP_REQUEST_REASSIGNED' : 'HELP_REQUEST_ASSIGNED',
      reason: '',
      previousState,
      nextState: {
        status: updatedHelpRequest.status || null,
        assignedByAdminId: updatedHelpRequest.assignedByAdminId || null,
        assignedOrganizerId: updatedHelpRequest.assignedOrganizerId || null,
        assignedAt: updatedHelpRequest.assignedAt || null,
      },
      metadata: {
        title: helpRequest.title,
        helpRequestTitle: helpRequest.title,
        organizerId: String(organizer._id || ''),
        organizerName: organizer.fullName || '',
        organizerEmail: organizer.email || '',
        requesterId: String(helpRequest.requesterId || ''),
      },
    });

    await this.createHelpRequestNotification({
      type: wasAssignedBefore ? 'HELP_REQUEST_REASSIGNED' : 'HELP_REQUEST_ASSIGNED',
      title: wasAssignedBefore
        ? 'NeedHelp assignment updated'
        : 'New NeedHelp assignment',
      message: wasAssignedBefore
        ? `You were reassigned to request: ${helpRequest.title}`
        : `You were assigned to request: ${helpRequest.title}`,
      recipientId: organizerId,
      senderId: adminId,
      link: `/organizer/need-help?highlight=${helpRequest._id}`,
      metadata: {
        helpRequestId: helpRequest._id.toString(),
        action: wasAssignedBefore ? 'reassigned' : 'assigned',
        requesterId: String(helpRequest.requesterId),
      },
    });

    try {
      const refreshedHelpRequest = await this.helpRequestRepository.findById(
        updatedHelpRequest._id,
        {
          populate: ['requester', 'assignedOrganizer', 'linkedProject'],
        }
      );

      return refreshedHelpRequest || updatedHelpRequest;
    } catch {
      return updatedHelpRequest;
    }
  }

  async getOrganizerSuggestions(helpRequestId, filters = {}) {
    const helpRequest = await this.helpRequestRepository.findById(helpRequestId);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    const searchText = filters.search?.trim().toLowerCase() || '';
    const limit = Number(filters.limit) > 0 ? Math.min(Number(filters.limit), 50) : 20;

    const organizers = await this.userRepository.findOrganizers({ search: searchText });
    const requestCoordinates = parseCoordinates(helpRequest?.location?.coordinates);

    const ranked = organizers
      .map((organizer) => {
        const organizerCoordinates = parseCoordinates(organizer.location);
        const distanceKm = getDistanceKm(requestCoordinates, organizerCoordinates);
        const relevanceScore = scoreRelevance(helpRequest, organizer);
        const distanceScore = scoreDistance(distanceKm);
        const score = relevanceScore + distanceScore;

        return {
          ...organizer,
          match: {
            relevanceScore,
            distanceKm,
            distanceScore,
            score,
          },
        };
      })
      .sort((a, b) => b.match.score - a.match.score || a.fullName.localeCompare(b.fullName))
      .slice(0, limit);

    return {
      helpRequestId: helpRequest._id,
      items: ranked,
    };
  }

  async getAssignedRequestsForOrganizer(organizerId, filters = {}, options = {}) {
    const queryFilters = {
      ...filters,
      assignedOrganizerId: organizerId,
    };

    return this.getHelpRequests(queryFilters, {
      ...options,
      viewer: { userId: organizerId, role: 'organizer' },
    });
  }

  async respondToAssignment(id, organizerId, action) {
    const helpRequest = await this.helpRequestRepository.findById(id, {
      populate: ['requester'],
    });

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (!helpRequest.assignedOrganizerId) {
      throw new AppError('This request has not been assigned to an organizer', 400);
    }

    if (helpRequest.assignedOrganizerId.toString() !== organizerId.toString()) {
      throw new AppError('You are not allowed to respond to this assignment', 403);
    }

    const organizer = await this.userRepository.findById(organizerId);
    const isAccept = action === 'accept';

    const updateData = isAccept
      ? { status: 'IN_PROGRESS' }
      : { status: 'VERIFIED', assignedOrganizerId: null, assignedAt: null };

    const updatedRequest = await this.helpRequestRepository.updateById(id, updateData);

    const adminRecipientId = helpRequest.assignedByAdminId || helpRequest.verifiedBy || null;

    if (adminRecipientId) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_ASSIGNMENT_RESPONDED',
        title: isAccept
          ? 'Organizer accepted assignment'
          : 'Organizer declined assignment',
        message: isAccept
          ? `${organizer?.fullName || 'Organizer'} accepted the assignment for: ${helpRequest.title}`
          : `${organizer?.fullName || 'Organizer'} declined the assignment for: ${helpRequest.title}`,
        recipientId: adminRecipientId,
        senderId: organizerId,
        link: `/admin/need-help/${helpRequest._id}`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: isAccept ? 'accepted' : 'rejected',
          organizerId: organizerId.toString(),
        },
      });
    }

    if (helpRequest.requesterId) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_ASSIGNMENT_RESPONDED',
        title: isAccept
          ? `${organizer?.fullName || 'Organizer'} accepted your NeedHelp request`
          : `${organizer?.fullName || 'Organizer'} could not take your NeedHelp request`,
        message: isAccept
          ? `Your request "${helpRequest.title}" is now being handled.`
          : `Your request "${helpRequest.title}" is waiting for a new organizer assignment.`,
        recipientId: helpRequest.requesterId,
        senderId: organizerId,
        link: `/need-help/${helpRequest._id}`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: isAccept ? 'accepted' : 'rejected',
        },
      });
    }

    return updatedRequest;
  }

  async completeHelpRequest(id, userId) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    const isRequester = helpRequest.requesterId.toString() === userId.toString();
    const isAssignedOrganizer =
      helpRequest.assignedOrganizerId?.toString() === userId.toString();

    if (!isRequester && !isAssignedOrganizer) {
      throw new AppError('You are not authorized to complete this help request', 403);
    }

    if (helpRequest.status !== 'IN_PROGRESS') {
      throw new AppError('Help request must be in progress to complete', 400);
    }

    const updated = await this.helpRequestRepository.updateById(id, {
      status: 'COMPLETED',
    });

    const requesterId = helpRequest.requesterId?._id || helpRequest.requesterId;
    const organizerId = helpRequest.assignedOrganizerId?._id || helpRequest.assignedOrganizerId;

    if (requesterId && String(requesterId) !== String(userId)) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_COMPLETED',
        title: 'NeedHelp request completed',
        message: `Your request "${helpRequest.title}" has been marked as completed.`,
        recipientId: requesterId,
        senderId: userId,
        link: `/need-help/${helpRequest._id}`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: 'completed',
        },
      });
    }

    if (organizerId && String(organizerId) !== String(userId)) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_COMPLETED',
        title: 'NeedHelp request completed',
        message: `The request "${helpRequest.title}" has been marked as completed.`,
        recipientId: organizerId,
        senderId: userId,
        link: `/organizer/need-help?highlight=${helpRequest._id}`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: 'completed',
        },
      });
    }

    return updated;
  }

  async getUrgentRequests(options = {}) {
    const viewer = buildViewerContext(options.viewer);

    if (viewer.isAdmin) {
      return this.helpRequestRepository.findMany(
        {
          isDeleted: false,
          status: { $in: ['VERIFIED', 'IN_PROGRESS'] },
          urgencyLevel: { $in: ['HIGH', 'CRITICAL'] },
        },
        {
          ...options,
          sort: { urgencyLevel: -1, createdAt: -1 },
          populate: ['requester', 'assignedOrganizer'],
        }
      );
    }

    return this.helpRequestRepository.findUrgent(options);
  }

  async getNearbyRequests(coordinates, maxDistance, options = {}) {
    const viewer = buildViewerContext(options.viewer);

    if (viewer.isAdmin) {
      return this.helpRequestRepository.findMany(
        {
          isDeleted: false,
          status: { $in: ['VERIFIED', 'IN_PROGRESS'] },
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates,
              },
              $maxDistance: maxDistance,
            },
          },
        },
        {
          ...options,
          populate: ['requester', 'assignedOrganizer'],
        }
      );
    }

    return this.helpRequestRepository.findNearby(coordinates, maxDistance, options);
  }

  async getMapRequests(viewer = null, filters = {}) {
    const context = buildViewerContext(viewer);
    const bounds = normalizeBounds(filters);
    const zoom = Number(filters.zoom || 6);
    const keyword = String(filters.search || '').trim().toLowerCase();

    const query = {
      isDeleted: false,
    };

    if (!context.isAdmin) {
      query.status = { $in: PUBLIC_VISIBLE_STATUSES };
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.urgencyLevel) {
      query.urgencyLevel = filters.urgencyLevel;
    }

    const result = await this.helpRequestRepository.findMany(query, {
      page: 1,
      limit: 1000,
      sort: { createdAt: -1 },
      select:
        '_id title story category urgencyLevel status location amountNeeded createdAt',
    });

    const allItems = (result?.data || [])
      .map(mapHelpRequestItem)
      .filter(Boolean)
      .filter((item) => {
        const [lng, lat] = item.coordinates;
        return isPointWithinBounds(lng, lat, bounds);
      })
      .filter((item) => {
        if (!keyword) return true;

        const haystack = [
          item.title,
          item.story,
          item.address,
          item.category,
          item.urgencyLevel,
          item.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(keyword);
      });

    if (zoom >= 12) {
      return {
        mode: 'item',
        items: allItems.map((item) => ({
          id: item.id,
          title: item.title,
          story: item.story,
          category: item.category,
          urgencyLevel: item.urgencyLevel,
          status: item.status,
          address: item.address,
          amountNeeded: item.amountNeeded,
          coordinates: item.coordinates,
          createdAt: item.createdAt,
        })),
        panelItems: allItems.slice(0, MAP_PANEL_LIMIT).map((item) => ({
          id: item.id,
          title: item.title,
          story: item.story,
          category: item.category,
          urgencyLevel: item.urgencyLevel,
          status: item.status,
          address: item.address,
          amountNeeded: item.amountNeeded,
          coordinates: item.coordinates,
          createdAt: item.createdAt,
        })),
        summary: buildMapSummary({
          mode: 'item',
          zoom,
          items: allItems,
          clusters: [],
        }),
      };
    }

    const cellSize = getMapClusterCellSize(zoom);
    const clusterMap = new Map();

    for (const item of allItems) {
      const [lng, lat] = item.coordinates;
      const key = buildClusterKey(lng, lat, cellSize);

      if (!clusterMap.has(key)) {
        clusterMap.set(key, {
          rawClusterId: key,
          clusterId: key,
          count: 0,
          latitudeSum: 0,
          longitudeSum: 0,
          firstCreatedAt: item.createdAt ? new Date(item.createdAt).getTime() : 0,
          items: [],
        });
      }

      const cluster = clusterMap.get(key);
      cluster.count += 1;
      cluster.latitudeSum += lat;
      cluster.longitudeSum += lng;
      cluster.items.push(item);

      const createdAtTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      if (createdAtTime > cluster.firstCreatedAt) {
        cluster.firstCreatedAt = createdAtTime;
      }
    }

    const items = [];
    const panelItems = [];
    const clusters = [];

    for (const cluster of clusterMap.values()) {
      if (cluster.count === 1) {
        const item = cluster.items[0];
        items.push({
          id: item.id,
          title: item.title,
          story: item.story,
          category: item.category,
          urgencyLevel: item.urgencyLevel,
          status: item.status,
          address: item.address,
          amountNeeded: item.amountNeeded,
          coordinates: item.coordinates,
          createdAt: item.createdAt,
        });

        if (panelItems.length < MAP_PANEL_LIMIT) {
          panelItems.push({
            id: item.id,
            title: item.title,
            story: item.story,
            category: item.category,
            urgencyLevel: item.urgencyLevel,
            status: item.status,
            address: item.address,
            amountNeeded: item.amountNeeded,
            coordinates: item.coordinates,
            createdAt: item.createdAt,
          });
        }

        continue;
      }

      const latitude = cluster.latitudeSum / cluster.count;
      const longitude = cluster.longitudeSum / cluster.count;

      items.push({
        type: 'cluster',
        clusterId: cluster.clusterId,
        rawClusterId: cluster.rawClusterId,
        count: cluster.count,
        latitude,
        longitude,
        expandZoom: getExpandZoom(zoom),
      });

      clusters.push({
        type: 'cluster',
        clusterId: cluster.clusterId,
        rawClusterId: cluster.rawClusterId,
        count: cluster.count,
        latitude,
        longitude,
        expandZoom: getExpandZoom(zoom),
      });

      const sortedClusterItems = [...cluster.items].sort((a, b) => {
        const urgencyRank = {
          CRITICAL: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
        };

        const urgencyDiff =
          (urgencyRank[b.urgencyLevel] || 0) - (urgencyRank[a.urgencyLevel] || 0);

        if (urgencyDiff !== 0) return urgencyDiff;

        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      for (const item of sortedClusterItems) {
        if (panelItems.length >= MAP_PANEL_LIMIT) break;

        panelItems.push({
          id: item.id,
          title: item.title,
          story: item.story,
          category: item.category,
          urgencyLevel: item.urgencyLevel,
          status: item.status,
          address: item.address,
          amountNeeded: item.amountNeeded,
          coordinates: item.coordinates,
          createdAt: item.createdAt,
        });
      }
    }

    return {
      mode: 'cluster',
      items,
      panelItems,
      summary: buildMapSummary({
        mode: 'cluster',
        zoom,
        items: allItems,
        clusters,
      }),
    };
  }

  async getStats() {
    return this.helpRequestRepository.getStats();
  }

  async getAsProjectData(helpRequestId) {
    const helpRequest = await this.helpRequestRepository.findById(helpRequestId, {
      populate: ['requester'],
    });

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    const categoryMapping = {
      Y_TE: 'Y_TE',
      GIAO_DUC: 'GIAO_DUC',
      THIEN_TAI: 'THIEN_TAI',
      XAY_DUNG: 'XAY_DUNG',
      MOI_TRUONG: 'MOI_TRUONG',
      KHAC: 'KHAC',
    };

    const isUrgent = ['HIGH', 'CRITICAL'].includes(helpRequest.urgencyLevel);

    const coverMedia =
      helpRequest.evidences?.find(
        (evidence) => evidence.mediaType === 'image' || !evidence.mediaType
      ) || null;

    return {
      title: helpRequest.title,
      description: helpRequest.story,
      category: categoryMapping[helpRequest.category] || 'KHAC',
      location: helpRequest.location,
      amountNeeded: helpRequest.amountNeeded,
      targetAmount: helpRequest.amountNeeded > 0 ? helpRequest.amountNeeded : 0,
      isFundraising: helpRequest.amountNeeded > 0,
      isUrgent,
      coverMedia: coverMedia
        ? [
            {
              url: coverMedia.url,
              publicId: coverMedia.publicId,
              mediaType: coverMedia.mediaType || 'image',
              originalName: coverMedia.originalName,
            },
          ]
        : [],
      documents: helpRequest.evidences || [],
      helpRequestInfo: {
        requesterId: helpRequest.requesterId,
        requesterName: helpRequest.requester?.fullName,
        requesterEmail: helpRequest.requester?.email,
        requesterPhone: helpRequest.requester?.phone,
        contactPhone: helpRequest.contactPhone,
        contactEmail: helpRequest.contactEmail,
      },
    };
  }

     async createHelpRequestNotification({
    type,
    title,
    message,
    recipientId,
    senderId,
    link,
    metadata,
    entityType = 'help_request',
    entityId = null,
  }) {
    if (!recipientId) {
      return null;
    }

    const typeValue = typeof type === 'string' ? type.toLowerCase() : type;

    const payload = {
      type: typeValue,
      title,
      message,
      recipientId,
      actorId: senderId || null,
      actionUrl: link || null,
      entityType,
      entityId: entityId || metadata?.helpRequestId || null,
      metadata: metadata || {},
    };

    try {
      if (this.notificationService?.createNotification) {
        return await this.notificationService.createNotification(payload);
      }

      if (!this.notificationRepository) {
        return null;
      }

      const created = await this.notificationRepository.create(payload);

      console.warn(
        '[NOTIFY] Created help request notification without realtime because notificationService is unavailable',
        {
          type: typeValue,
          recipientId: String(recipientId),
        }
      );

      return created;
    } catch (error) {
      console.error('[NOTIFY] Failed to create help request notification:', error.message);
      return null;
    }
  }
}