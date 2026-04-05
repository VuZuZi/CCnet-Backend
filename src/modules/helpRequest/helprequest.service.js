import AppError from '../../core/AppError.js';

const toRadians = (value) => (value * Math.PI) / 180;

const normalizeRole = (role = '') => role.toString().trim().toLowerCase();

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

export default class HelpRequestService {
  constructor({
    helprequestRepository,
    cloudinaryProvider,
    transactionManager,
    userRepository,
    notificationRepository,
  }) {
    this.helpRequestRepository = helprequestRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.transactionManager = transactionManager;
    this.userRepository = userRepository;
    this.notificationRepository = notificationRepository;
  }

  async createHelpRequest(userId, data) {
    const helpRequestData = {
      ...data,
      requesterId: userId,
      status: 'VERIFIED',
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

    const query = { isDeleted: false };

    if (status) {
      query.status = status;
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
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { story: { $regex: search, $options: 'i' } },
        { 'location.address': { $regex: search, $options: 'i' } },
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
      options
    );
  }

  async getHelpRequestById(id, userId = null) {
    const helpRequest = await this.helpRequestRepository.findById(id, {
      populate: ['requester', 'verifier', 'assignedOrganizer', 'linkedProject'],
    });

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    return helpRequest;
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
      filteredData.status = 'VERIFIED';
      filteredData.rejectionReason = null;
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
        .filter((e) => e.publicId)
        .map((e) => e.publicId);
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

    const updateData = {
      verifiedBy: adminId,
      verifiedAt: new Date(),
    };

    if (approved) {
      updateData.status = 'VERIFIED';
    } else {
      if (!rejectionReason) {
        throw new AppError('Rejection reason is required', 400);
      }
      updateData.status = 'REJECTED';
      updateData.rejectionReason = rejectionReason;
    }

    return this.helpRequestRepository.updateById(id, updateData);
  }

  async assignOrganizer(id, adminId, organizerId) {
    console.log(`[ASSIGN] Starting assignment: requestId=${id}, organizerId=${organizerId}`);
    
    const helpRequest = await this.helpRequestRepository.findById(id);
    console.log(`[ASSIGN] Found request:`, { id: helpRequest?._id, title: helpRequest?.title, status: helpRequest?.status });

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (!['VERIFIED', 'IN_PROGRESS'].includes(helpRequest.status)) {
      throw new AppError('Help request must be verified before assigning organizer', 400);
    }

    const organizer = await this.userRepository.findById(organizerId);
    console.log(`[ASSIGN] Found organizer:`, { id: organizer?._id, role: organizer?.role, fullName: organizer?.fullName });
    
    if (!organizer) {
      throw new AppError('Organizer not found', 404);
    }

    if (normalizeRole(organizer.role) !== 'organizer') {
      throw new AppError('Selected user is not an organizer', 400);
    }

    const updateData = {
      assignedOrganizerId: organizerId,
      assignedAt: new Date(),
      status: 'VERIFIED',
    };
    
    console.log(`[ASSIGN] Updating with data:`, updateData);
    
    const updatedHelpRequest = await this.helpRequestRepository.updateById(id, updateData);
    console.log(`[ASSIGN] Updated request:`, { 
      id: updatedHelpRequest?._id,
      assignedOrganizerId: updatedHelpRequest?.assignedOrganizerId,
      status: updatedHelpRequest?.status
    });

    console.log(`[ASSIGN] Creating notification for organizer ${organizerId}`);
    await this.createHelpRequestNotification({
      type: 'HELP_REQUEST_ASSIGNED',
      title: 'New NeedHelp assignment',
      message: `You were assigned to request: ${helpRequest.title}`,
      recipientId: organizerId,
      senderId: adminId,
      link: `/need-help/${helpRequest._id}`,
      metadata: { helpRequestId: helpRequest._id.toString(), action: 'assigned' },
    });
    console.log(`[ASSIGN] Notification created for organizer`);

    if (helpRequest.requesterId) {
      console.log(`[ASSIGN] Creating notification for requester ${helpRequest.requesterId}`);
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_ASSIGNED',
        title: 'Organizer assigned to your request',
        message: `${organizer.fullName || 'An organizer'} is now reviewing your request: ${helpRequest.title}`,
        recipientId: helpRequest.requesterId,
        senderId: adminId,
        link: `/need-help/${helpRequest._id}`,
        metadata: { helpRequestId: helpRequest._id.toString(), organizerId: organizerId.toString() },
      });
      console.log(`[ASSIGN] Notification created for requester`);
    }

    console.log(`[ASSIGN] Assignment completed successfully`);
    return updatedHelpRequest;
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
    console.log(`[QUERY-ASSIGNED] organizerId=${organizerId}, filters=`, filters);
    
    const queryFilters = {
      ...filters,
      assignedOrganizerId: organizerId,
    };
    console.log(`[QUERY-ASSIGNED] Final query filters:`, queryFilters);
    
    const result = await this.getHelpRequests(queryFilters, options);
    
    console.log(`[QUERY-ASSIGNED] Found ${result.total || result.length || 0} requests for organizer`);
    
    return result;
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

    const actionLabel = isAccept ? 'accepted' : 'rejected';
    const title = isAccept
      ? 'Organizer accepted your NeedHelp request'
      : 'Organizer declined your NeedHelp request';
    const message = isAccept
      ? `${organizer?.fullName || 'Organizer'} accepted the assignment for: ${helpRequest.title}`
      : `${organizer?.fullName || 'Organizer'} rejected the assignment for: ${helpRequest.title}`;

    if (helpRequest.requesterId) {
      await this.createHelpRequestNotification({
        type: 'HELP_REQUEST_ASSIGNMENT_RESPONSE',
        title,
        message,
        recipientId: helpRequest.requesterId,
        senderId: organizerId,
        link: `/need-help/${helpRequest._id}`,
        metadata: {
          helpRequestId: helpRequest._id.toString(),
          action: actionLabel,
        },
      });
    }

    return updatedRequest;
  }

  async linkProject(id, projectId) {
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    return this.helpRequestRepository.updateById(id, {
      linkedProjectId: projectId,
    });
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

    return this.helpRequestRepository.updateById(id, { status: 'COMPLETED' });
  }

  async getUrgentRequests(options = {}) {
    return this.helpRequestRepository.findUrgent(options);
  }

  async getNearbyRequests(coordinates, maxDistance, options = {}) {
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

    // Map help request category to project category
    const categoryMapping = {
      'Y_TE': 'Y_TE',
      'GIAO_DUC': 'GIAO_DUC',
      'THIEN_TAI': 'THIEN_TAI',
      'XAY_DUNG': 'XAY_DUNG',
      'MOI_TRUONG': 'MOI_TRUONG',
      'KHAC': 'KHAC'
    };

    // Determine if it's urgent from urgency level
    const isUrgent = ['HIGH', 'CRITICAL'].includes(helpRequest.urgencyLevel);

    // Convert evidences to media format
    const coverMedia = helpRequest.evidences?.find((e) => e.mediaType === 'image' || !e.mediaType) || null;

    return {
      title: helpRequest.title,
      description: helpRequest.story,
      category: categoryMapping[helpRequest.category] || 'KHAC',
      location: helpRequest.location,
      amountNeeded: helpRequest.amountNeeded,
      targetAmount: helpRequest.amountNeeded > 0 ? helpRequest.amountNeeded : 0,
      isFundraising: helpRequest.amountNeeded > 0,
      isUrgent,
      coverMedia: coverMedia ? [{
        url: coverMedia.url,
        publicId: coverMedia.publicId,
        mediaType: coverMedia.mediaType || 'image',
        originalName: coverMedia.originalName
      }] : [],
      documents: helpRequest.evidences || [],
      helpRequestInfo: {
        requesterId: helpRequest.requesterId,
        requesterName: helpRequest.requester?.fullName,
        requesterEmail: helpRequest.requester?.email,
        requesterPhone: helpRequest.requester?.phone,
        contactPhone: helpRequest.contactPhone,
        contactEmail: helpRequest.contactEmail,
      }
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
  }) {
    if (!this.notificationRepository || !recipientId) {
      return null;
    }

    return this.notificationRepository.create({
      type,
      title,
      message,
      recipient: 'user',
      recipientId,
      sender: senderId ? 'user' : 'system',
      senderId: senderId || null,
      link,
      metadata: metadata || {},
    });
  }
}
