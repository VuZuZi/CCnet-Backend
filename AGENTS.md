# CCnet-Backend/AGENTS.md — Backend Agent Rules

This file defines backend-specific rules for AI coding agents working inside `CCnet-Backend/`.

The root `../AGENTS.md` still applies. If there is any conflict, follow the stricter rule.

---

## 1. Backend Summary

The backend is a Node.js/Express application using:

- Express REST API
- MongoDB + Mongoose
- Redis
- BullMQ workers
- Awilix dependency injection
- JWT access tokens
- refresh tokens stored server-side
- Redis blacklist for revoked access tokens
- SePay + VietQR as the active payment flow
- Cloudinary media storage
- Socket/SSE/notification-related services
- background jobs for reconciliation, KYC, cleanup, and financial maintenance

This backend contains financial, identity, authorization, and admin workflows. Treat it as high-risk by default.

---

## 2. Backend Directory Map

Important backend areas:

```text
CCnet-Backend/
├─ src/
│  ├─ app.js
│  ├─ server.js
│  ├─ config/
│  ├─ container/
│  ├─ core/
│  ├─ middlewares/
│  └─ modules/
├─ scripts/
├─ package.json
├─ docker-compose.yml
└─ AGENTS.md
```

Common module pattern:

```text
src/modules/<domain>/
├─ *.routes.js
├─ *.controller.js
├─ *.service.js
├─ *.repository.js
├─ *.model.js
├─ *.validation.js
└─ *.constant.js
```

Do not assume every module has every file.

---

## 3. Runtime Warning

Do **not** run backend commands blindly.

Backend startup may initialize:

- database connection;
- Redis connection;
- BullMQ queues;
- workers;
- scheduled jobs;
- reconciliation jobs;
- webhook-related code;
- media cleanup jobs;
- KYC maintenance jobs;
- financial processors.

Before running any backend command, confirm:

1. Which `.env` is loaded.
2. Which MongoDB instance is targeted.
3. Which Redis instance is targeted.
4. Whether workers will start.
5. Whether reconciliation/refund/payment jobs may run.
6. Whether data is local, staging, or production.

If uncertain, do not run the command. Report the uncertainty.

---

## 4. Commands

Known backend scripts from project context:

```text
npm run dev
npm run start
```

`npm run dev` is dangerous unless the environment is confirmed safe because it can start API/socket/webhook/worker-related processes.

Safe inspection commands are generally limited to file reads/searches.

Do not run:

```text
npm run dev
npm run start
node scripts/*
database reset
seed scripts
migration scripts
reconciliation scripts
refund scripts
bulk update/delete scripts
deploy commands
```

unless explicitly approved.

---

## 5. Awilix Dependency Injection Rules

The backend uses Awilix DI.

Core rules:

- Do not rename services, controllers, repositories, providers, processors, or constructor dependencies casually.
- Do not rename files that are auto-loaded by the container unless you trace all DI registrations.
- Do not change `formatName` assumptions.
- Do not replace dependency injection with direct imports unless there is a clear reason.
- Do not modify `src/container/index.js` without a plan.
- If a dependency cannot be resolved, inspect container registration before changing business logic.

Because this project is JavaScript, many DI errors appear only at runtime.

When editing a service/controller/repository, check:

```text
src/container/index.js
src/config/routes.js
the module route file
the controller constructor
the service constructor
the repository constructor
```

---

## 6. Request Flow

Typical backend flow:

```text
Express route
→ middleware
→ validation
→ controller
→ service
→ repository
→ Mongoose model
→ response/error handler
```

Agents must preserve this layering.

Controllers should stay thin.

Services should contain business logic.

Repositories should contain data access.

Models should define schema, validation, indexes, and hooks.

Do not move business rules into controllers unless the existing module already follows that pattern and the change is small.

---

## 7. Auth and Authorization Rules

Canonical roles are:

```text
user
organizer
admin
```

The `User` schema does **not** define `manager`.

Existing code may mention `manager`; treat it as a known mismatch/legacy state. Do not expand it without explicit approval.

Important auth components:

```text
src/middlewares/auth.middleware.js
src/modules/auth/auth.routes.js
src/modules/auth/auth.controller.js
src/modules/auth/auth.service.js
src/modules/user/user.model.js
src/modules/user/user.repository.js
src/modules/user/user.service.js
```

Rules:

- `authenticate` verifies JWT and Redis blacklist.
- `authorize(...)` checks role only.
- `authorize(...)` does **not** check object ownership.
- Ownership checks must happen in service/controller logic.
- Do not rely on frontend route guards for security.
- Do not add routes that are protected only in the UI.
- Do not bypass KYC middleware for organizer-only sensitive actions.
- Do not add `manager` permissions unless the schema, frontend roles, and admin management are explicitly updated.

For banned/inactive users, login and refresh check status. Be careful when changing ban/session behavior.

---

## 8. KYC and Organizer Rules

Organizer onboarding uses organizer request flow.

Important files:

```text
src/modules/organizerRequest/
src/modules/user/user.model.js
src/modules/bankAccount/
src/middlewares/kyc.middleware.js
```

Known behavior:

- User submits organizer request.
- Email must be verified.
- Existing organizer cannot submit another organizer request.
- Active pipeline prevents duplicate pending processing.
- Request currently moves to `PENDING` directly.
- Micro-deposit code exists, but the current active path appears to be direct pending/admin review.
- Admin approves organizer request.
- Approval updates user role to `organizer` and KYC/organization fields.
- Admin declines request with reason.
- Bank account flow currently can create verified active accounts.

Do not assume micro-deposit is active unless verified in the current task.

---

## 9. Payment Provider Rules

Active provider:

```text
SePay + VietQR
```

Legacy/inactive context:

```text
PayOS
```

Do not treat PayOS as the active payment system.

Important areas:

```text
src/modules/transaction/
src/modules/escrow/
src/modules/disbursement/
src/modules/accounting/
src/core/payment/
src/config/index.js
```

SePay environment variables are required by config. PayOS variables may exist but are optional/legacy.

Do not rename `createPaymentLink` style compatibility methods without tracing all callers. In this project, method names may be generic while implementation uses SePay/VietQR.

---

## 10. Financial System Rules

Financial code is high-risk.

Do not edit these areas without a plan:

```text
transaction.model.js
transaction.service.js
transaction.repository.js
transaction.worker.js
MoneyMath.js
escrow.model.js
escrow.repository.js
escrow.service.js
suspense transaction files
disbursement files
daily ledger files
system financial files
admin finance files
SePay provider files
```

Money rules:

- Use existing money helpers such as `MoneyMath`.
- Do not introduce raw floating-point calculations.
- Do not change platform fee logic casually.
- Do not bypass transaction status guards.
- Do not delete financial records.
- Do not weaken immutability hooks.
- Do not update completed transactions without checking model restrictions.
- Do not change refund/cancellation logic without tracing escrow, wallet, and notification side effects.

Financial flow includes:

```text
donation initiation
→ pending transaction
→ SePay/VietQR transfer
→ webhook
→ idempotency/duplicate checks
→ completed transaction
→ escrow/project balance update
→ system financial/platform fee update
```

Suspense flow handles unmatched incoming bank transfers. Treat it as financial code.

Disbursement flow includes:

```text
organizer request
→ admin approval
→ escrow reserve
→ transfer confirmation
→ escrow commit/release
→ disbursement transaction
→ milestone/evidence updates
```

---

## 11. Transaction and Escrow Rules

When editing transaction/escrow logic, check:

```text
transaction model hooks
transaction repository atomic methods
transaction service transaction manager usage
escrow reserve/commit/release behavior
system financial updates
daily ledger/reconciliation effects
event/outbox side effects
```

Do not split atomic financial operations unless you understand transaction/session usage.

If a repository method accepts `session`, preserve session propagation.

If a service runs inside `transactionManager.runInTransaction`, do not call non-transactional updates unless intentional.

---

## 12. Evidence and Disbursement Rules

Important areas:

```text
src/modules/project/models/milestone-evidence.model.js
src/modules/project/milestone-evidence.*
src/modules/disbursement/
src/modules/media/
src/modules/escrow/
```

Known behavior:

- Organizer evidence submission checks project ownership.
- Evidence media must belong to the organizer.
- Receipt media must belong to the organizer.
- Financial milestones require financial evidence/receipts.
- Non-financial milestones may auto-pass when valid GPS media is within expected radius.
- Financial evidence requires manual review.
- Evidence review can affect milestone status and organizer retained balance.
- Disbursement depends on milestone status, evidence, escrow availability, and verified bank account.
- Disbursement reserve/commit/release must remain consistent.

Do not change evidence/disbursement without reading:

```text
docs/agent/06-project-evidence-disbursement.md
docs/agent/05-financial-flow.md
```

---

## 13. Project Lifecycle Rules

Important areas:

```text
src/modules/project/
src/modules/admin/services/adminProject.service.js
src/modules/admin/utils/adminProject.utils.js
src/modules/project/project.constant.js
```

Known status mapping:

- Reviewable: `PENDING_APPROVAL`, `REVISION_REQUESTED`, `UNDER_REVIEW`
- Funded project approval goes to `FUNDING`
- Volunteer-only project approval goes to `RECRUITING`
- Incoming `COMPLETED` maps to `COMPLETED_SUCCESSFULLY`
- Incoming `CANCELLED` maps to `CANCELLED_BY_PLATFORM`

Admin status changes can trigger:

- escrow creation;
- revision timeout jobs;
- cancellation refunds;
- donor/volunteer notifications;
- project group conversation sync;
- admin action logs.

Do not change project status transitions casually.

---

## 14. Media Upload Rules

Important areas:

```text
src/middlewares/upload.middleware.js
src/middlewares/cleanup.middleware.js
src/modules/media/
src/core/CloudinaryProvider.js
```

Known behavior:

- Multer stores temp files in OS temp directory.
- Magic-byte validation checks actual file signatures.
- Cleanup middleware deletes temp files after response finish/close.
- Images may be optimized to WebP.
- EXIF GPS may be extracted.
- Client location may be used as fallback.
- Cloudinary stores uploaded files.
- Media ownership is important for evidence and deletion.

Do not weaken:

- file size limits;
- MIME allowlist;
- magic-byte validation;
- ownership checks;
- Cloudinary deletion safety.

---

## 15. Worker and Queue Rules

Important areas:

```text
src/core/JobQueue.js
src/core/RedisClient.js
worker files
processor files
```

Known behavior:

- BullMQ requires `REDIS_URL`.
- Jobs may retry automatically.
- Workers may perform financial, media, KYC, notification, or reconciliation side effects.
- Backend startup can initialize workers and scheduled jobs.

Do not run workers against unknown Redis/MongoDB.

Do not add repeatable jobs without unique `jobId` and clear schedule.

Do not change retry/backoff behavior without understanding side effects.

---

## 16. Validation and Error Handling

Important areas:

```text
src/middlewares/validate.middleware.js
src/middlewares/errorHandler.js
module *.validation.js files
```

Rules:

- Preserve Zod/Joi validation behavior.
- If service logic requires a field, validation should also require it unless there is a deliberate reason.
- Do not hide validation errors.
- Do not convert operational errors into generic success responses.
- Do not swallow errors in financial/auth flows.

---

## 17. Environment and Secrets

Do not modify real `.env` files.

Important env groups include:

```text
MONGODB_URI
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
SEPAY_BANK_NAME
SEPAY_ACCOUNT_NUMBER
SEPAY_WEBHOOK_SECRET
SEPAY_API_TOKEN
CLOUDINARY_*
EMAIL_*
GOOGLE_CLIENT_ID
GEMINI_*
GROQ_API_KEY
```

`REDIS_URL` is required by runtime queue/Redis classes even if config also has host/port fields.

PayOS env variables may exist but are legacy/optional.

---

## 18. Safe Backend Editing Checklist

Before changing backend code:

```text
1. What route/API is affected?
2. Which controller receives the request?
3. Which service owns the business rule?
4. Which repository/model persists data?
5. Is there validation for the input?
6. Is auth required?
7. Is role check enough, or is ownership check needed?
8. Does the change affect money, KYC, evidence, disbursement, or admin approval?
9. Does it run inside a Mongo transaction/session?
10. Does it emit events or enqueue jobs?
11. What can be safely verified without touching real services?
```

---

## 19. Backend Agent Response Format

For backend investigation:

```text
Backend current behavior:
Files inspected:
Route/controller/service/repository/model chain:
Auth/ownership checks:
Data mutations:
Side effects/jobs/events:
Risks:
Recommended next step:
```

For backend implementation:

```text
Plan:
Files to change:
Why each file changes:
Risk level:
Verification plan:
Rollback notes:
```

After backend implementation:

```text
Changed files:
Summary:
Commands run:
Verification result:
Database/queue/payment impact:
Remaining risks:
```

---

## 20. Stop Conditions

Stop and ask before editing if:

- route mentions `manager`;
- ownership is unclear;
- request may affect another user/organizer/project;
- money can be moved, refunded, reserved, released, or reconciled;
- SePay webhook behavior changes;
- transaction/escrow/disbursement status changes;
- evidence review behavior changes;
- schema/index/hook changes are needed;
- a command may start workers;
- `.env` or secrets are involved;
- production/staging data may be touched.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **CCnet-Backend** (4743 symbols, 9254 relationships, 288 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/CCnet-Backend/context` | Codebase overview, check index freshness |
| `gitnexus://repo/CCnet-Backend/clusters` | All functional areas |
| `gitnexus://repo/CCnet-Backend/processes` | All execution flows |
| `gitnexus://repo/CCnet-Backend/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
