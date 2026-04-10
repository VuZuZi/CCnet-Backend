import { Router } from "express";
import { getContainer } from "../../container/index.js";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { maybeAuthenticate } from "../../middlewares/maybeAuth.middleware.js";
import {
  requireKycTier,
  ensureKycActive,
  ensureKycValidFor
} from "../../middlewares/kyc.middleware.js";
import { z } from "zod";
import {
  createDraftSchema,
  updateDraftSchema,
  exploreQuerySchema,
  workspaceQuerySchema
} from "./project.validation.js";
import { validateBody, validateQuery } from "../../middlewares/validate.middleware.js";
import {
  uploadFiles,
  uploadMedia,
  validateMagicBytes,
} from "../../middlewares/upload.middleware.js";
import { autoCleanupTempFiles } from "../../middlewares/cleanup.middleware.js";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import { parseJsonFields } from "../../middlewares/parseFormData.middleware.js";

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
  try {
    if (!req.scope) {
      throw new Error(
        "Bắt buộc phải có req.scope. Kiểm tra lại di.middleware.",
      );
    }
    const controller = req.scope.resolve("projectController");

    if (typeof controller[action] !== "function") {
      throw new Error(
        `Action [${action}] không tồn tại trong ProjectController.`,
      );
    }
    return controller[action](req, res, next);
  } catch (error) {
    next(error);
  }
};

const projectUploads = uploadFiles.fields([
  { name: "coverMedia", maxCount: 1 },
  { name: "documents", maxCount: 5 },
]);

router.get("/featured", execute("getFeatured"));
router.get("/volunteers-needed", execute("getVolunteerNeeded"));

router.get(
  "/explore",
  validateQuery(exploreQuerySchema),
  execute("getExploreProjects")
);

router.get(
  "/organizer/stats",
  authenticate,
  authorize("Organizer"),
  execute("getWorkspaceStats"),
);

router.get(
  "/organizer/my-projects",
  authenticate,
  authorize("Organizer"),
  validateQuery(workspaceQuerySchema),
  execute("getWorkspaceProjects"),
);

router.get("/:id/feed/posts", maybeAuthenticate, execute("getFeedPosts"));
router.post("/:id/feed/posts", authenticate, uploadMedia.single("media"), execute("createFeedPost"));
router.get("/:id/feed/posts/:postId/comments", maybeAuthenticate, execute("listFeedComments"));
router.post("/:id/feed/posts/:postId/comments", authenticate, execute("createFeedComment"));
router.post("/:id/feed/posts/:postId/like", authenticate, execute("toggleFeedPostLike"));
router.post("/:id/feed/comments/:commentId/like", authenticate, execute("toggleFeedCommentLike"));

router.get("/:id", optionalAuthenticate, execute("getDetail"));

router.post(
  "/",
  authenticate,
  authorize("Organizer"),
  requireKycTier(1),
  ensureKycActive,
  validateBody(createDraftSchema),
  execute("createDraft"),
);

router.put(
  "/:id/draft",
  authenticate,
  authorize("Organizer"),
  requireKycTier(1),
  ensureKycActive,
  validateBody(updateDraftSchema),
  execute("updateDraft"),
);

router.post(
  "/:id/submit",
  authenticate,
  authorize("Organizer"),
  ensureKycActive,
  ensureKycValidFor(30),
  execute("submitForApproval"),
);

const reportProjectSchema = z.object({
  reason_code: z.enum([
    "spam",
    "harassment",
    "inappropriate",
    "violence",
    "hate_speech",
    "other",
  ]),
  description: z.string().max(1000).optional(),
});

router.post(
  "/:id/report",
  authenticate,
  validateBody(reportProjectSchema),
  execute("reportProject"),
);

export default router;