import AppError from '../../core/AppError.js';
import User from '../user/user.model.js';

const toRadians = (value) => (value * Math.PI) / 180;
const normalizeRole = (role = '') => role.toString().trim().toLowerCase();

const PUBLIC_VISIBLE_STATUSES = ['VERIFIED', 'IN_PROGRESS', 'COMPLETED'];
const ASSIGNABLE_STATUSES = ['VERIFIED', 'IN_PROGRESS'];

const parseCoordinates = (value) => {
  if (!value) return null;

  if (Array.isArray(value) && value.length === 2) {
    const [lng, lat] = value;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.coordinates) && value.coordinates.length === 2) {
      const [lng, lat] = value.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }

    if (Number.isFinite(value.lng) && Number.isFinite(value.lat)) {
      return [value.lng, value.lat];
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

const scoreRelevance = (helpRequest, organizer) => {
  const requestAddress = helpRequest?.location?.address?.toLowerCase() || '';
  const organizerLocation = organizer?.location?.toLowerCase() || '';
  const requestCategory = helpRequest?.category?.toLowerCase() || '';

  const profileText = [organizer?.headline, organizer?.about, ...(organizer?.skills || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

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

const normalizeMapItem = (helpRequest) => ({
  id: String(helpRequest?._id || ''),
  title: helpRequest?.title || 'Yêu cầu trợ giúp',
  story: helpRequest?.story || '',
  urgencyLevel: helpRequest?.urgencyLevel || 'MEDIUM',
  category: helpRequest?.category || 'KHAC',
  status: helpRequest?.status || '',
  amountNeeded: Number(helpRequest?.amountNeeded || 0),
  address: helpRequest?.location?.address || 'Chưa có địa điểm cụ thể',
  coordinates: Array.isArray(helpRequest?.location?.coordinates)
    ? helpRequest.location.coordinates
    : [0, 0],
  location: helpRequest?.location || null,
  createdAt: helpRequest?.createdAt || null,
});

export default class HelpRequestService {
  constructor({
    helprequestRepository,
    cloudinaryProvider,
    transactionManager,
    userRepository,
    notificationRepository,
    adminActionLogRepository,
  }) {
    this.helpRequestRepository = helprequestRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.transactionManager = transactionManager;
    this.userRepository = userRepository;
    this.notificationRepository = notificationRepository;
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
      status: 'PENDING',
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

  async getHelpRequestMap(query = {}, viewer = null) {
    const context = buildViewerContext(viewer);

    const north = Number(query.north);
    const south = Number(query.south);
    const east = Number(query.east);
    const west = Number(query.west);
    const zoom = Number(query.zoom || 6);
    const category = query.category ? String(query.category).trim() : '';
    const urgencyLevel = query.urgencyLevel ? String(query.urgencyLevel).trim() : '';
    const search = query.search ? String(query.search).trim() : '';

    if (
      !Number.isFinite(north) ||
      !Number.isFinite(south) ||
      !Number.isFinite(east) ||
      !Number.isFinite(west)
    ) {
      throw new AppError('Viewport không hợp lệ', 400);
    }

    if (north <= south) {
      throw new AppError('north phải lớn hơn south', 400);
    }

    if (east <= west) {
      throw new AppError('east phải lớn hơn west', 400);
    }

    const filter = {
      isDeleted: false,
      location: {
        $geoWithin: {
          $box: [
            [west, south],
            [east, north],
          ],
        },
      },
    };

    if (!context.isAdmin) {
      filter.status = { $in: ['VERIFIED', 'IN_PROGRESS', 'COMPLETED'] };
    }

    if (category) {
      filter.category = category;
    }

    if (urgencyLevel) {
      filter.urgencyLevel = urgencyLevel;
    }

    if (search) {
      const regex = { $regex: search, $options: 'i' };
      filter.$or = [
        { title: regex },
        { story: regex },
        { 'location.address': regex },
      ];
    }

    const result = await this.helpRequestRepository.findMany(filter, {
      page: 1,
      limit: 1000,
      sort: { createdAt: -1 },
      populate: ['requester', 'assignedOrganizer'],
    });

    const items = Array.isArray(result?.data) ? result.data : [];
    const normalizedItems = items
      .map(normalizeMapItem)
      .filter(
        (item) =>
          Array.isArray(item.coordinates) &&
          item.coordinates.length === 2 &&
          Number.isFinite(Number(item.coordinates[0])) &&
          Number.isFinite(Number(item.coordinates[1]))
      );

    return {
      mode: 'item',
      items: normalizedItems,
      panelItems: normalizedItems,
      summary: {
        totalVisible: normalizedItems.length,
        itemCount: normalizedItems.length,
        clusterCount: 0,
        requestCount: normalizedItems.length,
        zoom,
      },
    };
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

    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(helpRequest.status)) {
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

    if (helpRequest.status === 'REJECTED') {
      filteredData.status = 'PENDING';
      filteredData.rejectionReason = null;
      filteredData.verifiedBy = null;
      filteredData.verifiedAt = null;
      filteredData.assignedByAdminId = null;
      filteredData.assignedOrganizerId = null;
      filteredData.assignedAt = null;
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

    if (!['PENDING', 'VERIFIED', 'REJECTED', 'CANCELLED'].includes(helpRequest.status)) {
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

  async verifyHelpRequest(id, adminId, approved, rejectionReason = null) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (helpRequest.status !== 'PENDING') {
      throw new AppError('Help request is not pending verification', 400);
    }

    const previousState = {
      status: helpRequest.status || null,
      verifiedBy: helpRequest.verifiedBy || null,
      verifiedAt: helpRequest.verifiedAt || null,
      assignedByAdminId: helpRequest.assignedByAdminId || null,
      assignedOrganizerId: helpRequest.assignedOrganizerId || null,
      assignedAt: helpRequest.assignedAt || null,
      rejectionReason: helpRequest.rejectionReason || null,
    };

    const updateData = {
      verifiedBy: adminId,
      verifiedAt: new Date(),
      assignedByAdminId: null,
      assignedOrganizerId: null,
      assignedAt: null,
    };

    if (approved) {
      updateData.status = 'VERIFIED';
      updateData.rejectionReason = null;
    } else {
      if (!rejectionReason) {
        throw new AppError('Rejection reason is required', 400);
      }
      updateData.status = 'REJECTED';
      updateData.rejectionReason = rejectionReason.trim();
    }

    const updated = await this.helpRequestRepository.updateById(id, updateData);

    await this.logAdminHelpRequestAction({
      actorId: adminId,
      actorRole: 'admin',
      targetId: updated._id,
      action: approved ? 'HELP_REQUEST_VERIFIED' : 'HELP_REQUEST_REJECTED',
      reason: approved ? '' : updateData.rejectionReason,
      previousState,
      nextState: {
        status: updated.status || null,
        verifiedBy: updated.verifiedBy || null,
        verifiedAt: updated.verifiedAt || null,
        assignedByAdminId: updated.assignedByAdminId || null,
        assignedOrganizerId: updated.assignedOrganizerId || null,
        assignedAt: updated.assignedAt || null,
        rejectionReason: updated.rejectionReason || null,
      },
      metadata: {
        title: helpRequest.title,
        helpRequestTitle: helpRequest.title,
        requesterId: String(helpRequest.requesterId || ''),
        approved: Boolean(approved),
      },
    });

    const requesterId = helpRequest.requesterId?._id || helpRequest.requesterId;

    if (approved && requesterId) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_VERIFIED',
        title: 'NeedHelp request verified',
        message: `Your NeedHelp request "${helpRequest.title}" has been verified.`,
        recipientId: requesterId,
        senderId: adminId,
        link: `/need-help/${helpRequest._id}`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: 'verified',
        },
      });
    }

    if (!approved && requesterId) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_REJECTED',
        title: 'NeedHelp request needs revision',
        message: `Your NeedHelp request "${helpRequest.title}" was rejected. Please review and resubmit.`,
        recipientId: requesterId,
        senderId: adminId,
        link: `/need-help/${helpRequest._id}/edit`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: 'rejected',
          rejectionReason: updateData.rejectionReason,
        },
      });
    }

    return updated;
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
          status: { $in: ['PENDING', 'VERIFIED', 'IN_PROGRESS'] },
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
        },
        {
          ...options,
          populate: ['requester', 'assignedOrganizer'],
        }
      );
    }

    return this.helpRequestRepository.findNearby(coordinates, maxDistance, options);
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
    if (!this.notificationRepository || !recipientId) {
      return null;
    }

    const typeValue = type?.toLowerCase ? type.toLowerCase() : type;

    try {
      return await this.notificationRepository.create({
        type: typeValue,
        title,
        message,
        recipientId,
        actorId: senderId || null,
        actionUrl: link || null,
        entityType,
        entityId: entityId || metadata?.helpRequestId || null,
        metadata: metadata || {},
      });
    } catch (error) {
      console.error('[NOTIFY] Failed to create help request notification:', error.message);
      return null;
    }
  }
}