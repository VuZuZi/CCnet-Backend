import AppError from "../../core/AppError.js";
import { ORGANIZER_REQUEST_STATUS } from "./organizerRequest.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";

const normalizeLocation = (location) => {
  if (!location || typeof location !== "object") return null;

  const address =
    typeof location.address === "string" ? location.address.trim() : "";
  const coordinates = Array.isArray(location.coordinates)
    ? location.coordinates.map((value) => Number(value))
    : [];

  if (
    location.type !== "Point" ||
    !address ||
    coordinates.length !== 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  return {
    type: "Point",
    address,
    coordinates,
  };
};

const normalizeBankBin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "UNKNOWN";

  const digits = raw.replace(/\D/g, "");
  if (digits && digits.length <= 10) {
    return digits;
  }

  return raw.slice(0, 10);
};

class OrganizerRequestService {
  constructor({
    userRepository,
    bankAccountRepository,
    organizerRequestRepository,
    transactionManager,
    eventBus,
    adminRepository,
  }) {
    this.userRepository = userRepository;
    this.bankAccountRepository = bankAccountRepository;
    this.organizerRequestRepository = organizerRequestRepository;
    this.transactionManager = transactionManager;
    this.eventBus = eventBus;
    this.adminRepository = adminRepository;
  }

  _ensureReason(reason, message = "Lý do là bắt buộc") {
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      throw new AppError(message, 400);
    }
    return normalizedReason;
  }

  async _logOrganizerAdminAction({
    actorId,
    action,
    reason,
    request,
    previousState,
    nextState,
  }) {
    if (!this.adminRepository?.createAdminActionLog) return;

    await this.adminRepository.createAdminActionLog({
      actorId,
      actorRole: "admin",
      targetType: "organizer_request",
      targetId: request._id,
      action,
      reason,
      previousState,
      nextState,
      metadata: {
        fullName: request.fullNameSnapshot,
        email: request.emailSnapshot,
        organizationName: request.organizationName,
        status: request.status,
      },
    });
  }

  async submitMyRequest(userId, payload) {
    const user = await this.userRepository.findById(userId);

    if (!user) throw new AppError("Không tìm thấy người dùng", 404);
    if (!user.isEmailVerified) {
      throw new AppError(
        "Bạn cần xác minh email trước khi đăng ký Organizer",
        400
      );
    }
    if (String(user.role || "").toLowerCase() === "organizer") {
      throw new AppError("Tài khoản này đã là Organizer", 400);
    }

    const activePipeline =
      await this.organizerRequestRepository.findActivePipelineByUserId(userId);
    if (activePipeline) {
      throw new AppError(
        "Bạn đang có một hồ sơ chờ xử lý. Không thể gửi thêm.",
        409
      );
    }

    const latestRequest =
      await this.organizerRequestRepository.findLatestByUserId(userId);
    const resubmissionCount = latestRequest
      ? (latestRequest.resubmissionCount || 0) + 1
      : 0;

    return await this.transactionManager.runInTransaction(async (session) => {
      const normalizedUserName = String(
        user.fullName || payload.fullNameSnapshot || ""
      )
        .trim()
        .toLowerCase();
      const normalizedBankName = String(payload.bankAccountName || "")
        .trim()
        .toLowerCase();
      const isNameMatch = normalizedUserName === normalizedBankName;

      const nextStatus = ORGANIZER_REQUEST_STATUS.PENDING;
      const microDepositAmount = null;

      let notes = payload.notes || "";
      const riskFlags = [];

      if (!isNameMatch) {
        riskFlags.push("NAME_MISMATCH");
        const warningText = `[SYSTEM FLAG] CẢNH BÁO: Tên chủ tài khoản ngân hàng (${payload.bankAccountName}) không khớp hoàn toàn với tên đăng ký User Profile (${user.fullName}).`;
        notes = notes
          ? `${warningText}\n\nGhi chú của user:\n${notes}`
          : warningText;
      }

      const bankData = {
        userId,
        bankName: payload.bankName,
        bin: normalizeBankBin(payload.bankBin),
        accountNumber: payload.bankAccountNumber,
        accountName: payload.bankAccountName,
        isVerified: false,
        microDepositAmount,
        status: "ACTIVE",
      };
      const newBank = await this.bankAccountRepository.create(bankData, session);

      const requestData = {
        userId,
        fullNameSnapshot: payload.fullNameSnapshot || user.fullName || "",
        emailSnapshot: payload.emailSnapshot || user.email || "",
        phoneSnapshot: payload.phoneSnapshot || user.phone || "",
        locationSnapshot:
          normalizeLocation(payload.locationSnapshot) || user.location || null,
        organizationName: payload.organizationName,
        organizationType: payload.organizationType,
        organizationWebsite: payload.organizationWebsite || "",
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
        submittedAt: new Date(),
      };

      const newRequest = await this.organizerRequestRepository.create(
        requestData,
        session
      );

      await this.userRepository.updateById(
        userId,
        { "kyc.status": "PENDING" },
        session
      );

      this._safeEmitSubmittedEvent(newRequest, user);

      return newRequest;
    });
  }

  async verifyMicroDeposit(userId, requestId, inputAmount) {
    return await this.transactionManager.runInTransaction(async (session) => {
      const request = await this.organizerRequestRepository.findById(requestId);

      if (
        !request ||
        String(request.userId._id || request.userId) !== String(userId)
      ) {
        throw new AppError("Không tìm thấy yêu cầu", 404);
      }

      if (request.status !== ORGANIZER_REQUEST_STATUS.AWAITING_MICRO_DEPOSIT) {
        throw new AppError(
          "Yêu cầu không ở trạng thái chờ xác nhận giao dịch.",
          400
        );
      }

      const bankAccount = await this.bankAccountRepository.findById(
        request.bankAccountId
      );
      if (!bankAccount) throw new AppError("Lỗi dữ liệu ngân hàng", 500);

      if (bankAccount.microDepositAmount !== Number(inputAmount)) {
        throw new AppError("Số tiền xác nhận không chính xác.", 400);
      }

      const existingAccounts =
        await this.bankAccountRepository.findByAccountNumber(
          bankAccount.accountNumber,
          bankAccount.bankName
        );

      const linkedUserIds = existingAccounts
        .map((acc) => String(acc.userId))
        .filter((id) => id !== String(userId));

      const isCrossLinked = linkedUserIds.length > 0;
      let reviewNote = "";

      if (isCrossLinked) {
        reviewNote =
          "[SYSTEM FLAG] Số tài khoản này đang được liên kết với user khác trên hệ thống.";
      }

      await this.bankAccountRepository.updateById(
        bankAccount._id,
        {
          isVerified: true,
          isCrossLinked,
          crossLinkedToUserIds: isCrossLinked ? linkedUserIds : [],
        },
        session
      );

      const updatedRequest = await this.organizerRequestRepository.updateById(
        requestId,
        {
          status: ORGANIZER_REQUEST_STATUS.PENDING,
          notes: isCrossLinked ? reviewNote : request.notes,
          riskFlags: isCrossLinked ? ["CROSS_LINKED_BANK"] : [],
        },
        session
      );

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
      throw new AppError("Không tìm thấy hồ sơ Organizer", 404);
    }

    return request;
  }

  async getAdminActionLogs(query = {}) {
    if (!this.adminRepository?.findOrganizerRequestActionLogs) {
      throw new AppError(
        "Organizer action log repository is not available",
        500
      );
    }

    return await this.adminRepository.findOrganizerRequestActionLogs(query);
  }

  async approveRequest(requestId, adminId, reviewReason) {
    const normalizedReason = this._ensureReason(
      reviewReason,
      "Lý do duyệt là bắt buộc"
    );

    return await this.transactionManager.runInTransaction(async (session) => {
      const request = await this.organizerRequestRepository.findById(requestId);

      if (!request) {
        throw new AppError("Không tìm thấy hồ sơ Organizer", 404);
      }

      if (request.status !== ORGANIZER_REQUEST_STATUS.PENDING) {
        throw new AppError(
          "Chỉ có thể duyệt hồ sơ đang ở trạng thái chờ PENDING",
          400
        );
      }

      const userId = request.userId?._id || request.userId;
      const user = await this.userRepository.findById(userId);

      if (!user) {
        throw new AppError("Người dùng nộp hồ sơ không tồn tại", 404);
      }

      const previousState = {
        status: request.status,
        reviewedBy: request.reviewedBy || null,
        reviewedAt: request.reviewedAt || null,
        reviewReason: request.reviewReason || "",
      };

      const updatedRequest = await this.organizerRequestRepository.updateById(
        requestId,
        {
          status: ORGANIZER_REQUEST_STATUS.APPROVED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewReason: normalizedReason,
        },
        session
      );

      const verifiedAt = new Date();
      const kycExpiryDate = new Date();
      kycExpiryDate.setFullYear(kycExpiryDate.getFullYear() + 1);

      await this.userRepository.updateById(
        user._id,
        {
          role: "organizer",
          organization: {
            name: request.organizationName || "",
            type: request.organizationType || "",
            website: request.organizationWebsite || "",
            location: normalizeLocation(request.locationSnapshot),
            verifiedAt,
            requestId: request._id,
          },
          kyc: {
            tier: 2,
            status: "VERIFIED",
            verifiedAt,
            expiresAt: kycExpiryDate,
          },
        },
        session
      );

      await this._logOrganizerAdminAction({
        actorId: adminId,
        action: "APPROVE_ORGANIZER_REQUEST",
        reason: normalizedReason,
        request: updatedRequest,
        previousState,
        nextState: {
          status: updatedRequest.status,
          reviewedBy: updatedRequest.reviewedBy,
          reviewedAt: updatedRequest.reviewedAt,
          reviewReason: updatedRequest.reviewReason,
        },
      });

      await this.emitOrganizerRequestUpdated(updatedRequest, {
        actorId: adminId,
        message: "Hồ sơ Organizer của bạn đã được duyệt.",
      });

      return updatedRequest;
    });
  }

  async declineRequest(requestId, adminId, reviewReason) {
    const normalizedReason = this._ensureReason(
      reviewReason,
      "Lý do từ chối là bắt buộc"
    );

    return await this.transactionManager.runInTransaction(async (session) => {
      const request = await this.organizerRequestRepository.findById(requestId);

      if (!request) {
        throw new AppError("Không tìm thấy hồ sơ Organizer", 404);
      }

      if (
        request.status !== ORGANIZER_REQUEST_STATUS.PENDING &&
        request.status !== ORGANIZER_REQUEST_STATUS.SYSTEM_CHECKING
      ) {
        throw new AppError("Chỉ có thể từ chối hồ sơ đang chờ duyệt", 400);
      }

      const userId = request.userId?._id || request.userId;

      const previousState = {
        status: request.status,
        reviewedBy: request.reviewedBy || null,
        reviewedAt: request.reviewedAt || null,
        reviewReason: request.reviewReason || "",
      };

      const updatedRequest = await this.organizerRequestRepository.updateById(
        requestId,
        {
          status: ORGANIZER_REQUEST_STATUS.DECLINED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewReason: normalizedReason,
        },
        session
      );

      await this.userRepository.updateById(
        userId,
        {
          "kyc.status": "UNVERIFIED",
        },
        session
      );

      await this._logOrganizerAdminAction({
        actorId: adminId,
        action: "DECLINE_ORGANIZER_REQUEST",
        reason: normalizedReason,
        request: updatedRequest,
        previousState,
        nextState: {
          status: updatedRequest.status,
          reviewedBy: updatedRequest.reviewedBy,
          reviewedAt: updatedRequest.reviewedAt,
          reviewReason: updatedRequest.reviewReason,
        },
      });

      await this.emitOrganizerRequestUpdated(updatedRequest, {
        actorId: adminId,
        message: "Hồ sơ Organizer của bạn đã bị từ chối.",
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
        applicantName: user.fullName || request.fullNameSnapshot || "",
        applicantEmail: user.email || request.emailSnapshot || "",
        organizationName: request.organizationName || "",
        status: request.status,
        actionUrl: `/admin/organizers/${request._id}`,
        message: "Có một hồ sơ đăng ký Organizer mới đang xử lý/chờ duyệt.",
      });
    } catch (error) {
      console.error(
        "[EventBus] Non-critical notification failed:",
        error.message
      );
    }
  }

  async emitOrganizerRequestUpdated(request, { actorId, message }) {
    try {
      if (!request?.userId) return;
      if (!this.eventBus) return;

      const recipientId =
        typeof request.userId === "object" ? request.userId._id : request.userId;
      const reviewerName =
        typeof request.reviewedBy === "object"
          ? request.reviewedBy.fullName || ""
          : "";

      await this.eventBus.emit(DOMAIN_EVENTS.ORGANIZER_REQUEST_UPDATED, {
        recipientId,
        actorId,
        requestId: request._id,
        status: request.status,
        reviewerName,
        message,
        actionUrl: "/organizer/request",
      });
    } catch (error) {
      console.error(
        "[EventBus] Notification updated failed:",
        error.message
      );
    }
  }
}

export default OrganizerRequestService;