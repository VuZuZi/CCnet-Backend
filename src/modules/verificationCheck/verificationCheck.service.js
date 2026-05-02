import AppError from "../../core/AppError.js";
import { VERIFICATION_CHECK_SUBJECT_TYPE } from "./verificationCheck.constant.js";

class VerificationCheckService {
  constructor({
    verificationCheckRepository,
    organizerRequestRepository,
    identityVerificationProvider,
  }) {
    this.verificationCheckRepository = verificationCheckRepository;
    this.organizerRequestRepository = organizerRequestRepository;
    this.identityVerificationProvider = identityVerificationProvider;
  }

  async runMockOrganizerRequestCheck({ organizerRequestId, adminUserId }) {
    const request =
      await this.organizerRequestRepository.findById(organizerRequestId);

    if (!request) {
      throw new AppError("Không tìm thấy hồ sơ Ban tổ chức.", 404);
    }

    if (request.status !== "PENDING") {
      throw new AppError(
        "Chỉ có thể chạy mô phỏng đối chiếu khi hồ sơ đang chờ xét duyệt.",
        400
      );
    }

    const userId = request.userId?._id || request.userId;

    const checkPayload = {
      userId: String(userId),
      organizerRequestId: String(organizerRequestId),
      fullNameSnapshot: request.fullNameSnapshot || "",
      emailSnapshot: request.emailSnapshot || "",
      organizationName: request.organizationName || "",
      legalType: request.organizationLegalType || "",
    };

    const providerResult =
      await this.identityVerificationProvider.runCheck(checkPayload);

    const checkRecord = await this.verificationCheckRepository.create({
      organizerRequestId,
      userId,
      subjectType: VERIFICATION_CHECK_SUBJECT_TYPE.ORGANIZER_REQUEST,
      subjectId: organizerRequestId,
      providerName: providerResult.providerName,
      providerMode: providerResult.providerMode,
      status: providerResult.status,
      isMock: providerResult.isMock ?? true,
      score: providerResult.score ?? 0,
      riskFlags: providerResult.riskFlags ?? [],
      resultSummary: providerResult.resultSummary || "",
      checkedAt: providerResult.checkedAt || new Date(),
      requestedBy: adminUserId,
      disclaimer: providerResult.disclaimer || "",
      metadata: {},
    });

    await this.organizerRequestRepository.updateById(organizerRequestId, {
      "ekycMetadata.providerName": "INTERNAL_MOCK",
      "ekycMetadata.providerSessionId": String(checkRecord._id),
      "ekycMetadata.verificationStatus": "MANUAL_REVIEW",
      "ekycMetadata.resultSummary":
        "Kết quả mô phỏng nội bộ — chưa thay thế xác minh chính thức.",
      "ekycMetadata.score": 0,
      "ekycMetadata.verifiedAt": null,
    });

    return checkRecord;
  }

  async listOrganizerRequestChecks(organizerRequestId) {
    return this.verificationCheckRepository.findByOrganizerRequestId(
      organizerRequestId,
      { limit: 20 }
    );
  }
}

export default VerificationCheckService;
