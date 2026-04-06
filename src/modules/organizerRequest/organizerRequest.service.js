import AppError from '../../core/AppError.js';
import User from '../user/user.model.js';
import OrganizerRequestRepository from './organizerRequest.repository.js';
import { ORGANIZER_REQUEST_STATUS } from './organizerRequest.constant.js';
import { eventBus, DOMAIN_EVENTS } from '../../config/notification.js';

class OrganizerRequestService {
  constructor({
    organizerRequestRepository = new OrganizerRequestRepository(),
    notificationEventBus = eventBus,
  } = {}) {
    this.organizerRequestRepository = organizerRequestRepository;
    this.notificationEventBus = notificationEventBus;
  }

  async submitMyRequest(userId, payload) {
    const user = await User.findById(userId).lean().exec();

    if (!user) {
      throw new AppError('Không tìm thấy người dùng', 404);
    }

    if (!user.isEmailVerified) {
      throw new AppError('Bạn cần xác minh email trước khi đăng ký Organizer', 400);
    }

    if (String(user.role || '').toLowerCase() === 'organizer') {
      throw new AppError('Tài khoản này đã là Organizer', 400);
    }

    const existingPending = await this.organizerRequestRepository.findPendingByUserId(userId);

    if (existingPending) {
      throw new AppError('Bạn đang có một đơn đăng ký Organizer đang chờ duyệt', 409);
    }

    const latestRequest = await this.organizerRequestRepository.findLatestByUserId(userId);
    const resubmissionCount = latestRequest ? (latestRequest.resubmissionCount || 0) + 1 : 0;

    const newRequest = await this.organizerRequestRepository.create({
      userId,
      fullNameSnapshot: payload.fullNameSnapshot || user.fullName || '',
      emailSnapshot: payload.emailSnapshot || user.email || '',
      phoneSnapshot: payload.phoneSnapshot || user.phone || '',
      locationSnapshot: payload.locationSnapshot || user.location || '',
      organizationName: payload.organizationName,
      organizationType: payload.organizationType,
      organizationWebsite: payload.organizationWebsite || '',
      idCardFront: payload.idCardFront,
      idCardBack: payload.idCardBack,
      businessLicense: payload.businessLicense || null,
      bankProof: payload.bankProof || null,
      bankName: payload.bankName,
      bankAccountNumber: payload.bankAccountNumber,
      bankAccountName: payload.bankAccountName,
      notes: payload.notes || '',
      aiRiskScore: 0,
      status: ORGANIZER_REQUEST_STATUS.PENDING,
      submittedAt: new Date(),
      resubmissionCount,
    });

    await this.emitOrganizerRequestSubmitted(newRequest, user);

    return newRequest;
  }

  async getMyLatestRequest(userId) {
    return this.organizerRequestRepository.findLatestByUserId(userId);
  }

  async listAdminRequests(query) {
    return this.organizerRequestRepository.listForAdmin(query);
  }

  async getAdminRequestDetail(requestId) {
    const request = await this.organizerRequestRepository.findById(requestId);

    if (!request) {
      throw new AppError('Không tìm thấy hồ sơ Organizer', 404);
    }

    return request;
  }

  async approveRequest(requestId, adminId) {
    const request = await this.organizerRequestRepository.findById(requestId);

    if (!request) {
      throw new AppError('Không tìm thấy hồ sơ Organizer', 404);
    }

    if (request.status !== ORGANIZER_REQUEST_STATUS.PENDING) {
      throw new AppError('Chỉ có thể duyệt hồ sơ đang ở trạng thái chờ', 400);
    }

    const user = await User.findById(request.userId?._id || request.userId).exec();

    if (!user) {
      throw new AppError('Người dùng nộp hồ sơ không tồn tại', 404);
    }

    user.role = 'Organizer';
    await user.save();

    const updated = await this.organizerRequestRepository.updateById(requestId, {
      status: ORGANIZER_REQUEST_STATUS.APPROVED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewReason: '',
    });

    await this.emitOrganizerRequestUpdated(updated, {
      actorId: adminId,
      message: 'Hồ sơ Organizer của bạn đã được duyệt.',
    });

    return updated;
  }

  async declineRequest(requestId, adminId, reviewReason) {
    const request = await this.organizerRequestRepository.findById(requestId);

    if (!request) {
      throw new AppError('Không tìm thấy hồ sơ Organizer', 404);
    }

    if (request.status !== ORGANIZER_REQUEST_STATUS.PENDING) {
      throw new AppError('Chỉ có thể từ chối hồ sơ đang ở trạng thái chờ', 400);
    }

    const updated = await this.organizerRequestRepository.updateById(requestId, {
      status: ORGANIZER_REQUEST_STATUS.DECLINED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewReason,
    });

    await this.emitOrganizerRequestUpdated(updated, {
      actorId: adminId,
      message: 'Hồ sơ Organizer của bạn đã bị từ chối.',
    });

    return updated;
  }

  async emitOrganizerRequestSubmitted(request, user) {
    if (!request?._id) return;
    if (!this.notificationEventBus || typeof this.notificationEventBus.emit !== 'function') {
      return;
    }

    await this.notificationEventBus.emit(DOMAIN_EVENTS.ORGANIZER_REQUEST_SUBMITTED, {
      actorId: request.userId,
      requestId: request._id,
      applicantName: user?.fullName || request.fullNameSnapshot || '',
      applicantEmail: user?.email || request.emailSnapshot || '',
      organizationName: request.organizationName || '',
      status: request.status,
      actionUrl: `/admin/organizers/${request._id}`,
      message: 'Có một hồ sơ đăng ký Organizer mới đang chờ duyệt.',
    });
  }

  async emitOrganizerRequestUpdated(request, { actorId, message }) {
    if (!request?.userId) return;
    if (!this.notificationEventBus || typeof this.notificationEventBus.emit !== 'function') {
      return;
    }

    const recipientId =
      typeof request.userId === 'object' ? request.userId._id : request.userId;

    const reviewerName =
      typeof request.reviewedBy === 'object' ? request.reviewedBy.fullName || '' : '';

    await this.notificationEventBus.emit(DOMAIN_EVENTS.ORGANIZER_REQUEST_UPDATED, {
      recipientId,
      actorId,
      requestId: request._id,
      status: request.status,
      reviewerName,
      message,
      actionUrl: '/organizer/request',
    });
  }
}

export default OrganizerRequestService;