export const VERIFICATION_PROVIDER = {
  INTERNAL_MOCK: "INTERNAL_MOCK",

  // SAFETY NOTICE: FPT_EKYC and VNPT_EKYC are reserved placeholders for
  // future official integrations. They are not active implementations and
  // must not be enabled without official technical docs, credentials, legal
  // review, and explicit approval. Current active implementation is the
  // mock/internal provider only.
  FPT_EKYC: "FPT_EKYC",
  VNPT_EKYC: "VNPT_EKYC",
};

export const VERIFICATION_PROVIDER_MODE = {
  MOCK: "MOCK",
  EXTERNAL: "EXTERNAL",
};

export const VERIFICATION_RESULT_STATUS = {
  SIMULATED: "SIMULATED",
  PENDING: "PENDING",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
};
