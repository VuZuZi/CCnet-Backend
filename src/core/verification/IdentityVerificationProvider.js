/**
 * Base class / contract for identity verification providers.
 * Future FPT/VNPT providers will extend this class and implement all methods.
 *
 * This class does NOT call external APIs or require credentials.
 */
class IdentityVerificationProvider {
  get providerName() {
    throw new Error("IdentityVerificationProvider.providerName: Not implemented");
  }

  get providerMode() {
    throw new Error("IdentityVerificationProvider.providerMode: Not implemented");
  }

  /**
   * Run an identity verification check.
   * @param {object} payload - Minimal data for the check (no raw ID images).
   * @returns {Promise<object>} - Check result object.
   */
  async runCheck(payload) {
    throw new Error("IdentityVerificationProvider.runCheck: Not implemented");
  }
}

export default IdentityVerificationProvider;
