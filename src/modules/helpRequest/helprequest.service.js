import AppError from '../../core/AppError.js';

export default class HelpRequestService {
  constructor({ helprequestRepository, cloudinaryProvider, transactionManager }) {
    this.helpRequestRepository = helprequestRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.transactionManager = transactionManager;
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
    const helpRequest = await this.helpRequestRepository.findById(id);

    if (!helpRequest || helpRequest.isDeleted) {
      throw new AppError('Help request not found', 404);
    }

    if (!['VERIFIED', 'IN_PROGRESS'].includes(helpRequest.status)) {
      throw new AppError('Help request must be verified before assigning organizer', 400);
    }

    return this.helpRequestRepository.updateById(id, {
      assignedOrganizerId: organizerId,
      assignedAt: new Date(),
      status: 'IN_PROGRESS',
    });
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
}
