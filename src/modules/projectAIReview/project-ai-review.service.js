import AppError from "../../core/AppError.js";
import { DOMAIN_EVENTS } from "../notification/constants/notification.events.js";
import { AI_PROVIDERS } from "../ai/interfaces/ai-provider.constant.js";
import {
  AI_REVIEW_BLOCKING_LEVELS,
  AI_REVIEW_CHECKLIST_STATES,
  AI_REVIEW_FINDING_LENSES,
  AI_REVIEW_FINDING_SEVERITIES,
  AI_REVIEW_RISK_LEVELS,
  AI_REVIEW_SECTIONS,
  AI_REVIEW_TARGET_TYPES,
  PROJECT_AI_REVIEW_ERROR_CODE,
  PROJECT_AI_REVIEW_JOB,
  PROJECT_AI_REVIEW_PROMPT_VERSION,
  PROJECT_AI_REVIEW_QUEUE,
  PROJECT_AI_REVIEW_STATUS,
} from "./project-ai-review.constant.js";
import {
  buildProjectReviewSnapshot,
  hashProjectReviewSnapshot,
} from "./project-review-snapshot.js";
import { validateNormalizedAIReviewOutput } from "./project-ai-review.validation.js";

const DEFAULT_TIMEOUT_MS = 90000;

const safeErrorMessage = (message, fallback = "Không thể tạo báo cáo phân tích sơ bộ.") =>
  String(message || fallback).slice(0, 500);

// --- Parser helpers ---

function hasMarkdownFence(text) {
  return /^\s*```/.test(text);
}

function stripMarkdownFences(text) {
  const trimmed = String(text || "").trim();
  // Match entire payload wrapped in ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * Extract the first balanced top-level JSON object from text that may have
 * leading/trailing prose. Fails if ambiguous or multiple top-level objects.
 */
function extractJsonObject(text) {
  const stripped = stripMarkdownFences(text);

  // Fast path: entire string is valid JSON
  try {
    const direct = JSON.parse(stripped);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      return direct;
    }
  } catch (_) {
    // Fall through to extraction
  }

  // Find first '{' and attempt to find the matching '}'
  const startIdx = stripped.indexOf("{");
  if (startIdx === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;

  for (let i = startIdx; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    return null;
  }

  // Check for multiple top-level objects (ambiguous)
  const remainder = stripped.slice(endIdx + 1).trim();
  if (remainder.startsWith("{")) {
    const err = new Error("AI output contains multiple top-level JSON objects");
    err.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID;
    err.parseStage = "JSON_PARSE";
    throw err;
  }

  const candidate = stripped.slice(startIdx, endIdx + 1);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

// Known enum fields and their allowed values for casing normalization
const ENUM_FIELD_MAP = {
  overallRiskLevel: AI_REVIEW_RISK_LEVELS,
  severity: AI_REVIEW_FINDING_SEVERITIES,
  section: AI_REVIEW_SECTIONS,
  targetType: AI_REVIEW_TARGET_TYPES,
  blockingLevel: AI_REVIEW_BLOCKING_LEVELS,
  lens: AI_REVIEW_FINDING_LENSES,
  suggestedState: AI_REVIEW_CHECKLIST_STATES,
};

const SEVERITY_ALIAS_MAP = {
  critical: "critical",
  severe: "critical",
  high: "critical",
  red: "critical",
  warning: "warning",
  medium: "warning",
  yellow: "warning",
  caution: "warning",
  needs_review: "needs_review",
  "needs review": "needs_review",
  review_required: "needs_review",
  needs_check: "needs_review",
  "needs check": "needs_review",
  moderate: "needs_review",
  requires_review: "needs_review",
  require_review: "needs_review",
  info: "info",
  low: "info",
  note: "info",
  informational: "info"
};

const SECTION_ALIAS_MAP = {
  summary: "project_summary",
  project: "project_summary",
  project_overview: "project_summary",
  overview: "project_summary",
  project_info: "project_summary",
  general: "project_summary",

  beneficiaries: "beneficiary",
  beneficiary_info: "beneficiary",
  beneficiary_review: "beneficiary",
  beneficiary_details: "beneficiary",

  finance: "budget",
  financial: "budget",
  funds: "budget",
  use_of_funds: "budget",
  budget_review: "budget",
  funding: "budget",

  milestone: "milestones",
  milestone_logic: "milestones",
  milestone_review: "milestones",
  execution: "milestones",
  execution_plan: "milestones",
  implementation: "milestones",
  implementation_plan: "milestones",

  documents: "evidence",
  document: "evidence",
  docs: "evidence",
  media: "evidence",
  files: "evidence",
  attachments: "evidence",
  evidence_plan: "evidence",
  evidence_review: "evidence",
  proof: "evidence",
  verification: "evidence",

  location: "timeline",
  schedule: "timeline",
  dates: "timeline",
  timeframe: "timeline",
  timeline_location: "timeline",
  time_location: "timeline",

  organizer_trust: "organizer",
  trust: "organizer",
  organization: "organizer",
  organiser: "organizer",
  organizer_profile: "organizer",
  kyc: "organizer",
  identity: "organizer",

  safety: "policy",
  fraud: "policy",
  policy_safety: "policy",
  compliance: "policy",
  risk: "policy",
  risk_signals: "policy"
};

const CHECKLIST_ALIAS_MAP = {
  beneficiary_clarity: "beneficiary_clear",
  budget_reasonable: "budget_clear",
  budget_use_of_funds_clear: "budget_clear",
  milestone_cost_clarity: "funded_milestones_cost_clarity",
  delivery_followup: "goods_have_delivery_followup",
  evidence_sufficient: "evidence_plan_sufficient",
  timeline_feasible: "timeline_location_feasible",
  organizer_trust: "organizer_trust_reviewed",
  documents_reviewed: "documents_media_reviewed"
};

const ALLOWED_CHECKLIST_KEYS = [
  "beneficiary_clear",
  "budget_clear",
  "funded_milestones_cost_clarity",
  "goods_have_delivery_followup",
  "evidence_plan_sufficient",
  "timeline_location_feasible",
  "organizer_trust_reviewed",
  "documents_media_reviewed",
  "ai_reviewed_or_bypassed",
  "approval_consequences_acknowledged",
];

/**
 * Normalize enum casing: if a known enum field has a value whose lowercase
 * matches an allowed enum value, normalize it. Unknown values pass through
 * for Zod to reject.
 */
function normalizeEnumCasing(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const result = { ...obj };

  for (const [field, allowed] of Object.entries(ENUM_FIELD_MAP)) {
    if (field in result && typeof result[field] === "string") {
      const lower = result[field].toLowerCase().trim();
      if (field === "severity" && SEVERITY_ALIAS_MAP[lower]) {
        result[field] = SEVERITY_ALIAS_MAP[lower];
      } else if (field === "section" && SECTION_ALIAS_MAP[lower]) {
        result[field] = SECTION_ALIAS_MAP[lower];
      } else if (allowed.includes(lower)) {
        result[field] = lower;
      }
    }
  }

  // Normalize nested findings
  if (Array.isArray(result.findings)) {
    result.findings = result.findings.map((f) => normalizeEnumCasing(f));
  }

  // Normalize nested checklistSuggestions
  if (Array.isArray(result.checklistSuggestions)) {
    const validSuggestions = [];
    for (const c of result.checklistSuggestions) {
      const normalized = normalizeEnumCasing(c);

      let k = typeof normalized.key === "string" ? normalized.key.toLowerCase().trim() : null;
      let lk = typeof normalized.labelKey === "string" ? normalized.labelKey.toLowerCase().trim() : null;

      k = CHECKLIST_ALIAS_MAP[k] || k;
      lk = CHECKLIST_ALIAS_MAP[lk] || lk;

      const kValid = ALLOWED_CHECKLIST_KEYS.includes(k);
      const lkValid = ALLOWED_CHECKLIST_KEYS.includes(lk);

      if (kValid && !lkValid) lk = k;
      if (lkValid && !kValid) k = lk;

      if (kValid || lkValid) {
        normalized.key = k;
        normalized.labelKey = lk;
        validSuggestions.push(normalized);
      }
    }
    result.checklistSuggestions = validSuggestions;
  }

  return result;
}

/**
 * Normalize nullable/optional fields with safe defaults.
 * Does not invent core required fields (summary, title, detail, etc.).
 */
function normalizeOptionalFields(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const result = { ...obj };

  // Normalize disclaimer: accept variations containing "advisory"
  if (typeof result.disclaimer === "string") {
    const lower = result.disclaimer.toLowerCase().trim();
    if (lower === "advisory_only" || lower === "advisory only") {
      result.disclaimer = "advisory_only";
    }
    // Otherwise leave as-is for Zod to reject
  }

  // Normalize nested findings
  if (Array.isArray(result.findings)) {
    result.findings = result.findings.map((f) => {
      const finding = { ...f };
      if (!("targetId" in finding) || finding.targetId === undefined) {
        finding.targetId = null;
      }
      if (!("suggestedRevisionText" in finding) || finding.suggestedRevisionText === undefined) {
        finding.suggestedRevisionText = null;
      }
      if (!("evidenceNeeded" in finding) || !Array.isArray(finding.evidenceNeeded)) {
        finding.evidenceNeeded = [];
      }
      return finding;
    });
  }

  // Normalize nested checklistSuggestions
  if (Array.isArray(result.checklistSuggestions)) {
    result.checklistSuggestions = result.checklistSuggestions.map((c) => {
      const suggestion = { ...c };
      if (!("sourceFindingIds" in suggestion) || !Array.isArray(suggestion.sourceFindingIds)) {
        suggestion.sourceFindingIds = [];
      }
      return suggestion;
    });
  }

  return result;
}

/**
 * Full parse + normalize pipeline for AI provider output.
 * Returns { parsed, rawContent, parseStage } on success.
 * Throws with .code, .parseStage, and optionally .validationIssues on failure.
 */
function parseAndNormalizeAIOutput(rawContent) {
  const content = String(rawContent || "").trim();

  if (!content) {
    const error = new Error("AI returned empty output");
    error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID;
    error.parseStage = "EMPTY_OUTPUT";
    throw error;
  }

  const extracted = extractJsonObject(content);
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) {
    const error = new Error("Could not extract a valid JSON object from AI output");
    error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID;
    error.parseStage = "JSON_PARSE";
    throw error;
  }

  const normalized = normalizeOptionalFields(normalizeEnumCasing(extracted));
  return normalized;
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Project review provider timed out");
      error.code = PROJECT_AI_REVIEW_ERROR_CODE.PROVIDER_TIMEOUT;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutId)
  );
}

function isMissingProviderConfigError(error) {
  return /key.*missing|missing.*key|not configured|missing in configuration/i.test(
    String(error?.message || "")
  );
}

class ProjectAIReviewService {
  constructor({
    projectAIReviewRepository,
    projectRepository,
    adminProjectRepository,
    config,
    jobQueue,
    eventBus,
    winstonLogger,
    userRepository,
    agreementRecordRepository,
  }) {
    this.projectAIReviewRepository = projectAIReviewRepository;
    this.projectRepository = projectRepository;
    this.adminProjectRepository = adminProjectRepository;
    this.config = config;
    this.jobQueue = jobQueue;
    this.eventBus = eventBus;
    this.logger = winstonLogger?.getLogger?.() || console;
    this.userRepository = userRepository;
    this.agreementRecordRepository = agreementRecordRepository;
  }

  getProviderConfig() {
    const aiConfig = this.config?.ai || {};
    const provider = String(aiConfig.projectReviewProvider || "")
      .trim()
      .toLowerCase();
    const timeoutMs =
      Number(aiConfig.projectReviewTimeoutMs || 0) || DEFAULT_TIMEOUT_MS;
    const promptVersion =
      aiConfig.projectReviewPromptVersion || PROJECT_AI_REVIEW_PROMPT_VERSION;

    if (!provider) {
      const error = new AppError("Project review AI provider is not configured.", 503);
      error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_PROVIDER_NOT_CONFIGURED;
      throw error;
    }

    if (![AI_PROVIDERS.GEMINI, AI_PROVIDERS.GROQ].includes(provider)) {
      const error = new AppError("Project review AI provider is invalid.", 503);
      error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_PROVIDER_INVALID;
      throw error;
    }

    const model =
      aiConfig.projectReviewModel ||
      (provider === AI_PROVIDERS.GROQ
        ? aiConfig.defaultGroqModel
        : aiConfig.defaultProModel || aiConfig.defaultFlashModel);

    if (!model) {
      const error = new AppError("Project review AI model is not configured.", 503);
      error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_PROVIDER_NOT_CONFIGURED;
      throw error;
    }

    return { provider, model, timeoutMs, promptVersion };
  }

  emitFailedRun(project, run, errorCode) {
    this.eventBus?.emit?.(DOMAIN_EVENTS.PROJECT_AI_REVIEW_FAILED, {
      projectId: run.projectId,
      runId: run._id,
      projectTitle: project?.title,
      errorCode,
    });
  }

  async buildOrganizerTrustContext(project) {
    const organizer =
      project?.organizerId && typeof project.organizerId === "object"
        ? project.organizerId
        : this.userRepository
          ? await this.userRepository.findById(project?.organizerId)
          : null;

    let agreement = null;
    const agreementSubjectId = organizer?.organization?.requestId;
    if (agreementSubjectId && this.agreementRecordRepository) {
      agreement = await this.agreementRecordRepository.findBySubject(
        "ORGANIZER_ONBOARDING",
        agreementSubjectId
      );
    }

    const priorProjectHistory = organizer?._id
      ? await this.projectRepository.getOrganizerReviewContext(
        organizer._id,
        project._id
      )
      : { unavailable: true };

    return {
      kyc: organizer?.kyc
        ? {
          status: organizer.kyc.status || null,
          tier: Number(organizer.kyc.tier || 0),
          verifiedAt: organizer.kyc.verifiedAt || null,
          expiresAt: organizer.kyc.expiresAt || null,
        }
        : { unavailable: true },
      organizerProfile: organizer
        ? {
          fullName: organizer.fullName || "",
          email: organizer.email || "",
          phone: organizer.phone || "",
          organization: organizer.organization || null,
        }
        : { unavailable: true },
      responsibilityAgreement: agreement
        ? {
          version: agreement.version,
          status: agreement.status,
          signedAt: agreement.signedAt,
          isSealed: Boolean(agreement.isSealed),
        }
        : { unavailable: true },
      priorProjectHistory,
    };
  }

  async ensureProjectReviewSnapshot(projectOrId) {
    const project =
      projectOrId && typeof projectOrId === "object" && projectOrId.title
        ? projectOrId
        : await this.adminProjectRepository.findProjectById(projectOrId);

    if (!project) {
      throw new AppError("Project not found.", 404);
    }

    const organizerTrust = await this.buildOrganizerTrustContext(project);
    const sanitizedSnapshot = buildProjectReviewSnapshot(project, organizerTrust);
    const projectSnapshotHash = hashProjectReviewSnapshot(sanitizedSnapshot);
    const submissionVersion = Math.max(1, Number(project.submissionVersion || 0) || 1);

    if (
      Number(project.submissionVersion || 0) !== submissionVersion ||
      project.projectSnapshotHash !== projectSnapshotHash
    ) {
      await this.projectRepository.updateReviewMetadata(project._id, {
        submissionVersion,
        projectSnapshotHash,
      });
    }

    return {
      project,
      organizerId: project.organizerId?._id || project.organizerId,
      submissionVersion,
      projectSnapshotHash,
      sanitizedSnapshot,
    };
  }

  async createRunForProject(projectOrId, { jobName = PROJECT_AI_REVIEW_JOB.RUN } = {}) {
    const snapshotState = await this.ensureProjectReviewSnapshot(projectOrId);

    let providerConfig;
    let initialFailure = null;

    try {
      providerConfig = this.getProviderConfig();
    } catch (error) {
      initialFailure = {
        errorCode:
          error?.code || PROJECT_AI_REVIEW_ERROR_CODE.AI_PROVIDER_NOT_CONFIGURED,
        errorMessageSafe: safeErrorMessage(
          error.message,
          "Project review AI provider is not configured."
        ),
      };
      providerConfig = {
        provider: "unconfigured",
        model: "unconfigured",
        promptVersion:
          this.config?.ai?.projectReviewPromptVersion ||
          PROJECT_AI_REVIEW_PROMPT_VERSION,
      };
    }

    const run = await this.projectAIReviewRepository.create({
      projectId: snapshotState.project._id,
      organizerId: snapshotState.organizerId,
      submissionVersion: snapshotState.submissionVersion,
      projectSnapshotHash: snapshotState.projectSnapshotHash,
      status: initialFailure
        ? PROJECT_AI_REVIEW_STATUS.FAILED
        : PROJECT_AI_REVIEW_STATUS.PENDING,
      provider: providerConfig.provider,
      model: providerConfig.model,
      promptVersion: providerConfig.promptVersion,
      sanitizedSnapshot: snapshotState.sanitizedSnapshot,
      ...(initialFailure
        ? {
          failedAt: new Date(),
          errorCode: initialFailure.errorCode,
          errorMessageSafe: initialFailure.errorMessageSafe,
        }
        : {}),
    });

    if (initialFailure) {
      this.logger?.warn?.("Project AI review run created as failed", {
        runId: String(run._id),
        projectId: String(run.projectId),
        errorCode: initialFailure.errorCode,
      });
      this.emitFailedRun(snapshotState.project, run, initialFailure.errorCode);
      return run;
    }

    try {
      await this.enqueueRun(run, jobName);
      return run;
    } catch (error) {
      const failed = await this.projectAIReviewRepository.markFailed(run._id, {
        errorCode: PROJECT_AI_REVIEW_ERROR_CODE.AI_QUEUE_ENQUEUE_FAILED,
        errorMessageSafe: "Không thể đưa báo cáo AI vào hàng đợi xử lý.",
      });

      this.logger?.warn?.("Project AI review enqueue failed", {
        runId: String(run._id),
        projectId: String(run.projectId),
        errorCode: PROJECT_AI_REVIEW_ERROR_CODE.AI_QUEUE_ENQUEUE_FAILED,
      });

      this.emitFailedRun(
        snapshotState.project,
        failed || run,
        PROJECT_AI_REVIEW_ERROR_CODE.AI_QUEUE_ENQUEUE_FAILED
      );

      return failed || run;
    }
  }

  async enqueueRun(run, jobName = PROJECT_AI_REVIEW_JOB.RUN) {
    if (!this.jobQueue) {
      const error = new Error("Project AI review queue is not available.");
      error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_QUEUE_ENQUEUE_FAILED;
      throw error;
    }

    return this.jobQueue.addJob(PROJECT_AI_REVIEW_QUEUE, jobName, {
      runId: run._id,
      projectId: run.projectId,
      submissionVersion: run.submissionVersion,
      projectSnapshotHash: run.projectSnapshotHash,
    });
  }

  async listRuns(projectId) {
    return this.projectAIReviewRepository.findByProject(projectId);
  }

  async getLatestRun(projectId, submissionVersion = null, projectSnapshotHash = null) {
    if (submissionVersion && projectSnapshotHash) {
      return this.projectAIReviewRepository.findLatestCurrent(
        projectId,
        submissionVersion,
        projectSnapshotHash
      );
    }

    return this.projectAIReviewRepository.findLatest(projectId);
  }

  async retryProjectReview(projectId) {
    const snapshotState = await this.ensureProjectReviewSnapshot(projectId);

    const latest = await this.projectAIReviewRepository.findLatestCurrent(
      projectId,
      snapshotState.submissionVersion,
      snapshotState.projectSnapshotHash
    );

    if (
      latest?.status === PROJECT_AI_REVIEW_STATUS.PENDING ||
      latest?.status === PROJECT_AI_REVIEW_STATUS.RUNNING
    ) {
      const error = new AppError(
        latest.status === PROJECT_AI_REVIEW_STATUS.PENDING
          ? "AI review đang chờ xử lý. Không thể tạo thêm yêu cầu."
          : "AI review đang chạy. Không thể tạo thêm yêu cầu.",
        409
      );
      error.existingRun = latest;
      throw error;
    }

    return this.createRunForProject(snapshotState.project, {
      jobName: PROJECT_AI_REVIEW_JOB.RETRY,
    });
  }

  buildPrompt(snapshot, metadata = {}) {
    const systemPrompt = [
      "You are an advisory project review assistant for CCNet charity platform admins.",
      "Your role is advisory ONLY. You must NOT approve, reject, verify, guarantee, decide, or replace the admin decision.",
      "Do not recommend approving or rejecting. Do not say the project is approved, rejected, verified, guaranteed, or safe.",
      "Use risk signals, review questions, and suggested revision text only.",
      "",
      "CRITICAL OUTPUT FORMAT RULES:",
      "- Return ONLY one valid JSON object.",
      "- Do NOT wrap the JSON in markdown code fences (``` or ```json).",
      "- Do NOT include any explanation, commentary, or text outside the JSON object.",
      "- All string values must be properly escaped JSON strings.",
      "- All human-readable text fields MUST be in Vietnamese (summary, findings.title, findings.detail, suggestedAdminQuestion, suggestedRevisionText, evidenceNeeded, checklistSuggestions.reason).",
      "- All enum values and keys MUST remain exactly English.",
      "- Severity MUST be exactly one of: info, needs_review, warning, critical.",
      "- Do NOT use high, medium, low, red, yellow for severity.",
      "- Section MUST be exactly one of: project_summary, beneficiary, budget, milestones, evidence, timeline, organizer, policy.",
      "- Do NOT use documents, media, organizer_trust, location, or feasibility as section values. Map them to evidence, organizer, timeline, or project_summary.",
      "- checklistSuggestions.key and checklistSuggestions.labelKey MUST be identical and one of the allowed keys. Do NOT invent new checklist keys.",
    ].join("\n");

    const userMessage = JSON.stringify({
      instruction: [
        "Create a preliminary advisory analysis for this submitted project.",
        "Review these lenses: completeness, legitimacy, feasibility, budget, milestone_logic, evidence_plan, organizer_trust, policy_safety.",
        "",
        "MILESTONE ANALYSIS RULES:",
        "- A 0 VND milestone is NOT automatically suspicious. It can represent action, delivery, volunteer work, evidence collection, reporting, hand-over, or verification.",
        "- A money milestone (targetAmount > 0) should include quantity, unit, and cost clarity.",
        "- Buying goods should connect to later delivery, distribution, hand-over, or verification milestones.",
        "- Volunteer or action milestones still need deliverables and evidence plan.",
        "",
        "ADVISORY RULES:",
        "- Do NOT provide a final decision recommendation.",
        "- Do NOT say 'approve', 'reject', 'I recommend approving', or 'this project should be approved/rejected'.",
        "- Use needs_review, warning, critical severity levels with suggested admin questions and revision text.",
        "- The disclaimer field MUST be exactly the string: advisory_only",
      ].join("\n"),
      outputSchema: {
        overallRiskLevel: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Must be exactly one of these lowercase values.",
        },
        overallRiskScore: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Integer from 0 (no risk) to 100 (maximum risk).",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Decimal from 0.0 to 1.0 indicating analysis confidence.",
        },
        summary: {
          type: "string",
          description: "Brief advisory summary, max 4000 chars. Advisory only, no final decision.",
        },
        disclaimer: {
          type: "string",
          const: "advisory_only",
          description: "Must be exactly the string: advisory_only",
        },
        findings: {
          type: "array",
          description: "Array of finding objects. May be empty if no issues found.",
          items: {
            id: "string, unique finding identifier, e.g. 'f1', 'f2'",
            lens: "exactly one of: completeness, legitimacy, feasibility, budget, milestone_logic, evidence_plan, organizer_trust, policy_safety (lowercase)",
            severity: "exactly one of: info, needs_review, warning, critical (lowercase)",
            section: "exactly one of: project_summary, beneficiary, budget, milestones, evidence, timeline, organizer, policy (lowercase)",
            targetType: "exactly one of: project, beneficiary, budget, milestone, document, timeline, organizer, policy (lowercase)",
            targetId: "string or null — reference to specific item if applicable, null otherwise",
            title: "string, short finding title, max 200 chars",
            detail: "string, detailed finding explanation, max 2000 chars",
            suggestedAdminQuestion: "string, question admin should investigate, max 1000 chars",
            suggestedRevisionText: "string or null — suggested revision text for organizer, null if not applicable",
            evidenceNeeded: "array of strings — list of evidence types needed, empty array [] if none",
            blockingLevel: "exactly one of: none, review_required, must_fix_before_approval (lowercase)",
            confidence: "number 0.0 to 1.0",
          },
        },
        checklistSuggestions: {
          type: "array",
          description: "Array of checklist suggestion objects. May be empty.",
          items: {
            key: "exactly one of the allowedChecklistKeys below",
            labelKey: "same value as key",
            suggestedState: "exactly one of: unchecked, needs_review, checked (lowercase)",
            reason: "string, reason for suggested state, max 1000 chars",
            sourceFindingIds: "array of finding id strings, empty array [] if none",
          },
        },
      },
      allowedChecklistKeys: [
        "beneficiary_clear",
        "budget_clear",
        "funded_milestones_cost_clarity",
        "goods_have_delivery_followup",
        "evidence_plan_sufficient",
        "timeline_location_feasible",
        "organizer_trust_reviewed",
        "documents_media_reviewed",
        "ai_reviewed_or_bypassed",
        "approval_consequences_acknowledged",
      ],
      submissionVersion: metadata.submissionVersion,
      projectSnapshotHash: metadata.projectSnapshotHash,
      projectSnapshot: snapshot,
    });

    return { systemPrompt, userMessage };
  }

  async processRun(runId, aiProviderFactory) {
    const run = await this.projectAIReviewRepository.findById(runId);

    if (!run) {
      throw new AppError("AI review run not found.", 404);
    }

    if (run.status !== PROJECT_AI_REVIEW_STATUS.PENDING) {
      return run;
    }

    const project = await this.adminProjectRepository.findProjectById(run.projectId);
    if (!project) {
      return this.projectAIReviewRepository.markFailed(run._id, {
        errorCode: "PROJECT_NOT_FOUND",
        errorMessageSafe: "Project not found.",
      });
    }

    const snapshotState = await this.ensureProjectReviewSnapshot(project);
    if (
      Number(run.submissionVersion) !== Number(snapshotState.submissionVersion) ||
      run.projectSnapshotHash !== snapshotState.projectSnapshotHash
    ) {
      await this.projectAIReviewRepository.updateById(run._id, {
        status: PROJECT_AI_REVIEW_STATUS.STALE,
        errorCode: PROJECT_AI_REVIEW_ERROR_CODE.STALE_SNAPSHOT,
        errorMessageSafe: "AI run belongs to an older project submission.",
      });
      return null;
    }

    const runningRun = await this.projectAIReviewRepository.markRunning(run._id);
    if (!runningRun) {
      return null;
    }

    let rawContent = null;
    try {
      if (!aiProviderFactory) {
        const error = new AppError("Project review AI provider factory is not available.", 503);
        error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_PROVIDER_NOT_CONFIGURED;
        throw error;
      }

      const provider = aiProviderFactory.getProvider(run.provider);
      const timeoutMs =
        Number(this.config?.ai?.projectReviewTimeoutMs || 0) ||
        DEFAULT_TIMEOUT_MS;
      const prompt = this.buildPrompt(snapshotState.sanitizedSnapshot, {
        submissionVersion: run.submissionVersion,
        projectSnapshotHash: run.projectSnapshotHash,
      });

      const providerResult = await withTimeout(
        provider.generateText({
          ...prompt,
          modelId: run.model,
        }),
        timeoutMs
      );
      rawContent = providerResult?.content;

      const parsedOutput = parseAndNormalizeAIOutput(rawContent);
      const normalizedOutput = validateNormalizedAIReviewOutput(parsedOutput);

      const completed = await this.projectAIReviewRepository.markCompleted(
        run._id,
        normalizedOutput
      );

      await this.projectAIReviewRepository.markStaleCurrentSnapshotRuns(
        run.projectId,
        run.submissionVersion,
        run.projectSnapshotHash,
        { excludeRunId: run._id }
      );

      this.eventBus?.emit?.(DOMAIN_EVENTS.PROJECT_AI_REVIEW_COMPLETED, {
        projectId: run.projectId,
        runId: run._id,
        projectTitle: project.title,
      });

      return completed;
    } catch (error) {
      const errorCode =
        error?.code ||
        (isMissingProviderConfigError(error)
          ? PROJECT_AI_REVIEW_ERROR_CODE.AI_PROVIDER_NOT_CONFIGURED
          : null) ||
        (error instanceof SyntaxError
          ? PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID
          : PROJECT_AI_REVIEW_ERROR_CODE.PROVIDER_FAILED);

      // --- Safe diagnostic logging for AI_OUTPUT_INVALID ---
      const diagnosticFields = {
        runId: String(run._id),
        projectId: String(run.projectId),
        errorCode,
      };

      if (
        errorCode === PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID &&
        rawContent !== undefined
      ) {
        const contentStr = String(rawContent || "");
        diagnosticFields.parseStage = error.parseStage || "UNKNOWN";
        diagnosticFields.outputLength = contentStr.length;
        diagnosticFields.hasMarkdownFence = hasMarkdownFence(contentStr);
        diagnosticFields.outputPreview = contentStr
          .replace(/[\r\n]+/g, " ")
          .slice(0, 1000);
        if (Array.isArray(error.validationIssues) && error.validationIssues.length > 0) {
          diagnosticFields.validationIssues = error.validationIssues.slice(0, 20);
        }
      }

      const failed = await this.projectAIReviewRepository.markFailed(run._id, {
        errorCode,
        errorMessageSafe: safeErrorMessage(error.message),
      });

      this.logger?.warn?.("Project AI review failed", diagnosticFields);

      this.eventBus?.emit?.(DOMAIN_EVENTS.PROJECT_AI_REVIEW_FAILED, {
        projectId: run.projectId,
        runId: run._id,
        projectTitle: project.title,
        errorCode,
      });

      return failed;
    }
  }
}

export default ProjectAIReviewService;
