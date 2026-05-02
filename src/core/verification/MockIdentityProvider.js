import IdentityVerificationProvider from "./IdentityVerificationProvider.js";
import {
  VERIFICATION_PROVIDER,
  VERIFICATION_PROVIDER_MODE,
  VERIFICATION_RESULT_STATUS,
} from "./verification.constant.js";

/**
 * Internal mock identity verification provider.
 * Returns a static simulated result for integration testing.
 *
 * Does NOT call external APIs.
 * Does NOT require credentials or .env config.
 * Does NOT store raw identity documents.
 * Does NOT claim official verification.
 */
class MockIdentityProvider extends IdentityVerificationProvider {
  get providerName() {
    return VERIFICATION_PROVIDER.INTERNAL_MOCK;
  }

  get providerMode() {
    return VERIFICATION_PROVIDER_MODE.MOCK;
  }

  async runCheck(payload) {
    return {
      providerName: this.providerName,
      providerMode: this.providerMode,
      status: VERIFICATION_RESULT_STATUS.SIMULATED,
      isMock: true,
      score: 0,
      riskFlags: [],
      resultSummary:
        "Kết quả mô phỏng nội bộ — chưa thay thế xác minh chính thức.",
      checkedAt: new Date(),
      disclaimer:
        "Đây là kết quả mô phỏng để kiểm tra luồng tích hợp nội bộ, không phải xác minh chính thức.",
    };
  }
}

export default MockIdentityProvider;
