import AppError from '../../core/AppError.js';
import User from '../user/user.model.js';
import OrganizerRequestRepository from './organizerRequest.repository.js';
import { ORGANIZER_REQUEST_STATUS } from './organizerRequest.constant.js';

class OrganizerRequestService {
  constructor({ organizerRequestRepository = new OrganizerRequestRepository() } = {}) {
    this.organizerRequestRepository = organizerRequestRepository;
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

    return updated;
  }
}

export default OrganizerRequestService;