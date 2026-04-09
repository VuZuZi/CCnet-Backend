import AppError from '../../core/AppError.js';
import { ORGANIZER_REQUEST_STATUS } from './organizerRequest.constant.js';
import { DOMAIN_EVENTS } from '../../config/notification.js';

class OrganizerRequestService {
  constructor({
    userRepository,
    bankAccountRepository,
    organizerRequestRepository,
    transactionManager,
    eventBus,
  }) {
    this.userRepository = userRepository;
    this.bankAccountRepository = bankAccountRepository;
    this.organizerRequestRepository = organizerRequestRepository;
    this.transactionManager = transactionManager;
    this.eventBus = eventBus;
  }

// async submitMyRequest(userId, payload) {
//     const user = await this.userRepository.findById(userId);

//     if (!user) throw new AppError('Không tìm thấy người dùng', 404);
//     if (!user.isEmailVerified) throw new AppError('Bạn cần xác minh email trước khi đăng ký Organizer', 400);
//     if (String(user.role || '').toLowerCase() === 'organizer') throw new AppError('Tài khoản này đã là Organizer', 400);

//     const activePipeline = await this.organizerRequestRepository.findActivePipelineByUserId(userId);
//     if (activePipeline) {
//       throw new AppError('Bạn đang có một hồ sơ chờ xử lý. Không thể gửi thêm.', 409);
//     }

//     const latestRequest = await this.organizerRequestRepository.findLatestByUserId(userId);
//     const resubmissionCount = latestRequest ? (latestRequest.resubmissionCount || 0) + 1 : 0;

//     return await this.transactionManager.runInTransaction(async (session) => {
//       const normalizedUserName = user.fullName.trim().toLowerCase();
//       const normalizedBankName = payload.bankAccountName.trim().toLowerCase();
//       const isNameMatch = normalizedUserName === normalizedBankName;

//       const nextStatus = ORGANIZER_REQUEST_STATUS.AWAITING_MICRO_DEPOSIT;
//       const microDepositAmount = Math.floor(Math.random() * 4000) + 1000;

//       console.log("💰 [DEV ONLY] Số tiền Micro-deposit FE cần nhập là:", microDepositAmount);

//       let notes = payload.notes || '';
//       let riskFlags = [];

//       if (!isNameMatch) {
//         riskFlags.push('NAME_MISMATCH');
//         const warningText = `[SYSTEM FLAG] CẢNH BÁO: Tên chủ tài khoản ngân hàng (${payload.bankAccountName}) không khớp hoàn toàn với tên đăng ký User Profile (${user.fullName}).`;
//         notes = notes ? `${warningText}\n\nGhi chú của user:\n${notes}` : warningText;
//       }

//       const bankData = {
//         userId,
//         bankName: payload.bankName,
//         accountNumber: payload.bankAccountNumber,
//         accountName: payload.bankAccountName,
//         isVerified: false,
//         microDepositAmount,
//         status: 'ACTIVE'
//       };
//       const newBank = await this.bankAccountRepository.create(bankData, session);

//       const requestData = {
//         userId,
//         fullNameSnapshot: payload.fullNameSnapshot || user.fullName || '',
//         emailSnapshot: payload.emailSnapshot || user.email || '',
//         phoneSnapshot: payload.phoneSnapshot || user.phone || '',
//         locationSnapshot: payload.locationSnapshot || user.location || '',
//         organizationName: payload.organizationName,
//         organizationType: payload.organizationType,
//         organizationWebsite: payload.organizationWebsite || '',

//         idCardFront: payload.idCardFront,
//         idCardBack: payload.idCardBack,
//         selfie: payload.selfie,
//         businessLicense: payload.businessLicense || null,
//         bankProof: payload.bankProof || null,

//         bankAccountId: newBank._id,

//         bankName: payload.bankName,
//         bankAccountNumber: payload.bankAccountNumber,
//         bankAccountName: payload.bankAccountName,
//         notes,
//         riskFlags,
//         aiRiskScore: isNameMatch ? 0 : 50,
//         resubmissionCount,

//         status: nextStatus,
//         submittedAt: new Date()
//       };

//       const newRequest = await this.organizerRequestRepository.create(requestData, session);

//       await this.userRepository.updateById(userId, { 'kyc.status': 'PENDING' }, session);

//       this._safeEmitSubmittedEvent(newRequest, user);

//       return newRequest;
//     });
//   }

async submitMyRequest(userId, payload) {
    const user = await this.userRepository.findById(userId);

    if (!user) throw new AppError('Không tìm thấy người dùng', 404);
    if (!user.isEmailVerified) throw new AppError('Bạn cần xác minh email trước khi đăng ký Organizer', 400);
    if (String(user.role || '').toLowerCase() === 'organizer') throw new AppError('Tài khoản này đã là Organizer', 400);

    const activePipeline = await this.organizerRequestRepository.findActivePipelineByUserId(userId);
    if (activePipeline) {
      throw new AppError('Bạn đang có một hồ sơ chờ xử lý. Không thể gửi thêm.', 409);
    }

    const latestRequest = await this.organizerRequestRepository.findLatestByUserId(userId);
    const resubmissionCount = latestRequest ? (latestRequest.resubmissionCount || 0) + 1 : 0;

    return await this.transactionManager.runInTransaction(async (session) => {
      const normalizedUserName = user.fullName.trim().toLowerCase();
      const normalizedBankName = payload.bankAccountName.trim().toLowerCase();
      const isNameMatch = normalizedUserName === normalizedBankName;

      // ==========================================
      // [CTO Fix & Tech Debt]: MVP Bypass Micro-Deposit
      // TODO [Tech Debt]: Tương lai tích hợp cổng thanh toán (BaaS) -> Bỏ comment out luồng AWAITING_MICRO_DEPOSIT
      // Hiện tại: Auto-pass đẩy thẳng lên PENDING cho Admin duyệt tay.
      // ==========================================
      const nextStatus = ORGANIZER_REQUEST_STATUS.PENDING; 
      const microDepositAmount = null; 

      let notes = payload.notes || '';
      let riskFlags = [];

      // Vẫn giữ hệ thống cảnh báo (Cực kỳ quan trọng vì Admin giờ phải duyệt tay 100%)
      if (!isNameMatch) {
        riskFlags.push('NAME_MISMATCH');
        const warningText = `[SYSTEM FLAG] CẢNH BÁO: Tên chủ tài khoản ngân hàng (${payload.bankAccountName}) không khớp hoàn toàn với tên đăng ký User Profile (${user.fullName}).`;
        notes = notes ? `${warningText}\n\nGhi chú của user:\n${notes}` : warningText;
      }

      // Lưu Bank (Chưa verify)
      const bankData = {
        userId,
        bankName: payload.bankName,
        accountNumber: payload.bankAccountNumber,
        accountName: payload.bankAccountName,
        isVerified: false, // Để False vì Admin sẽ check bằng mắt
        microDepositAmount,
        status: 'ACTIVE'
      };
      const newBank = await this.bankAccountRepository.create(bankData, session);

      // Lưu Request
      const requestData = {
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
        selfie: payload.selfie, 
        businessLicense: payload.businessLicense || null,
        bankProof: payload.bankProof || null,

        bankAccountId: newBank._id,

        bankName: payload.bankName,
        bankAccountNumber: payload.bankAccountNumber,
        bankAccountName: payload.bankAccountName,
        notes, 
        riskFlags, 
        aiRiskScore: isNameMatch ? 0 : 50, 
        resubmissionCount,

        status: nextStatus,
        submittedAt: new Date()
      };

      const newRequest = await this.organizerRequestRepository.create(requestData, session);

      await this.userRepository.updateById(userId, { 'kyc.status': 'PENDING' }, session);

      this._safeEmitSubmittedEvent(newRequest, user);

      return newRequest;
    });
  }

  async verifyMicroDeposit(userId, requestId, inputAmount) {
    return await this.transactionManager.runInTransaction(async (session) => {
      const request = await this.organizerRequestRepository.findById(requestId);

      if (!request || String(request.userId._id || request.userId) !== String(userId)) {
        throw new AppError('Không tìm thấy yêu cầu', 404);
      }

      if (request.status !== ORGANIZER_REQUEST_STATUS.AWAITING_MICRO_DEPOSIT) {
        throw new AppError('Yêu cầu không ở trạng thái chờ xác nhận giao dịch.', 400);
      }

      const bankAccount = await this.bankAccountRepository.findById(request.bankAccountId);
      if (!bankAccount) throw new AppError('Lỗi dữ liệu ngân hàng', 500);

      if (bankAccount.microDepositAmount !== Number(inputAmount)) {
        throw new AppError('Số tiền xác nhận không chính xác.', 400);
      }

      const existingAccounts = await this.bankAccountRepository.findByAccountNumber(
        bankAccount.accountNumber,
        bankAccount.bankName
      );

      const linkedUserIds = existingAccounts
        .map(acc => String(acc.userId))
        .filter(id => id !== String(userId));

      const isCrossLinked = linkedUserIds.length > 0;
      let reviewNote = '';

      if (isCrossLinked) {
        reviewNote = '[SYSTEM FLAG] Số tài khoản này đang được liên kết với user khác trên hệ thống.';
      }

      await this.bankAccountRepository.updateById(bankAccount._id, {
        isVerified: true,
        isCrossLinked,
        crossLinkedToUserIds: isCrossLinked ? linkedUserIds : []
      }, session);

      const updatedRequest = await this.organizerRequestRepository.updateById(requestId, {
        status: ORGANIZER_REQUEST_STATUS.PENDING,
        notes: isCrossLinked ? reviewNote : request.notes,
        riskFlags: isCrossLinked ? ['CROSS_LINKED_BANK'] : []
      }, session);

      return updatedRequest;
    });
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
    return await this.transactionManager.runInTransaction(async (session) => {
      const request = await this.organizerRequestRepository.findById(requestId);

      if (!request) {
        throw new AppError('Không tìm thấy hồ sơ Organizer', 404);
      }

      if (request.status !== ORGANIZER_REQUEST_STATUS.PENDING) {
        throw new AppError('Chỉ có thể duyệt hồ sơ đang ở trạng thái chờ PENDING', 400);
      }

      const userId = request.userId?._id || request.userId;
      const user = await this.userRepository.findById(userId);

      if (!user) {
        throw new AppError('Người dùng nộp hồ sơ không tồn tại', 404);
      }

      const updatedRequest = await this.organizerRequestRepository.updateById(requestId, {
        status: ORGANIZER_REQUEST_STATUS.APPROVED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewReason: '',
      }, session);

      const kycExpiryDate = new Date();
      kycExpiryDate.setFullYear(kycExpiryDate.getFullYear() + 1);

      await this.userRepository.updateById(user._id, {
        role: 'Organizer',
        kyc: {
          tier: 1,
          status: 'VERIFIED',
          verifiedAt: new Date(),
          expiresAt: kycExpiryDate
        }
      }, session);

      await this.emitOrganizerRequestUpdated(updatedRequest, {
        actorId: adminId,
        message: 'Hồ sơ Organizer của bạn đã được duyệt.',
      });

      return updatedRequest;
    });
  }

  async declineRequest(requestId, adminId, reviewReason) {
    return await this.transactionManager.runInTransaction(async (session) => {
      const request = await this.organizerRequestRepository.findById(requestId);

      if (!request) {
        throw new AppError('Không tìm thấy hồ sơ Organizer', 404);
      }

      if (request.status !== ORGANIZER_REQUEST_STATUS.PENDING && request.status !== ORGANIZER_REQUEST_STATUS.SYSTEM_CHECKING) {
        throw new AppError('Chỉ có thể từ chối hồ sơ đang chờ duyệt', 400);
      }

      const userId = request.userId?._id || request.userId;

      const updatedRequest = await this.organizerRequestRepository.updateById(requestId, {
        status: ORGANIZER_REQUEST_STATUS.DECLINED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewReason,
      }, session);

      await this.userRepository.updateById(userId, {
        'kyc.status': 'UNVERIFIED'
      }, session);

      await this.emitOrganizerRequestUpdated(updatedRequest, {
        actorId: adminId,
        message: 'Hồ sơ Organizer của bạn đã bị từ chối.',
      });

      return updatedRequest;
    });
  }

  async _safeEmitSubmittedEvent(request, user) {
    try {
      if (!this.eventBus) return;
      await this.eventBus.emit(DOMAIN_EVENTS.ORGANIZER_REQUEST_SUBMITTED, {
        actorId: request.userId,
        requestId: request._id,
        applicantName: user.fullName || request.fullNameSnapshot || '',
        applicantEmail: user.email || request.emailSnapshot || '',
        organizationName: request.organizationName || '',
        status: request.status,
        actionUrl: `/admin/organizers/${request._id}`,
        message: 'Có một hồ sơ đăng ký Organizer mới đang xử lý/chờ duyệt.',
      });
    } catch (error) {
      console.error('[EventBus] Non-critical notification failed:', error.message);
    }
  }

  async emitOrganizerRequestUpdated(request, { actorId, message }) {
    try {
      if (!request?.userId) return;
      if (!this.eventBus) return;

      const recipientId = typeof request.userId === 'object' ? request.userId._id : request.userId;
      const reviewerName = typeof request.reviewedBy === 'object' ? request.reviewedBy.fullName || '' : '';

      await this.eventBus.emit(DOMAIN_EVENTS.ORGANIZER_REQUEST_UPDATED, {
        recipientId,
        actorId,
        requestId: request._id,
        status: request.status,
        reviewerName,
        message,
        actionUrl: '/organizer/request',
      });
    } catch (error) {
      console.error('[EventBus] Notification updated failed:', error.message);
    }
  }
}

export default OrganizerRequestService;