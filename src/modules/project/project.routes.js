import { Router } from "express";
import { z } from "zod";

import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { maybeAuthenticate } from "../../middlewares/maybeAuth.middleware.js";
import {
  requireKycTier,
  ensureKycActive,
  ensureKycValidFor,
} from "../../middlewares/kyc.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { uploadMedia } from "../../middlewares/upload.middleware.js";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import {
  createDraftSchema,
  updateDraftSchema,
} from "./project.validation.js";

const router = Router();

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

const resolveProjectController = (req) => {
  if (!req.scope) {
    throw new Error("Bắt buộc phải có req.scope. Kiểm tra lại di.middleware.");
  }

  const controller = req.scope.resolve("projectController");

  if (!controller) {
    throw new Error("Không resolve được projectController từ request scope.");
  }

  return controller;
};

const execute = (action) => async (req, res, next) => {
  try {
    const controller = resolveProjectController(req);
    const handler = controller?.[action];

    if (typeof handler !== "function") {
      throw new Error(`Action [${action}] không tồn tại trong ProjectController.`);
    }

    await handler.call(controller, req, res, next);
  } catch (error) {
    next(error);
  }
};

const organizerOnly = [authenticate, authorize("Organizer")];
const organizerKycTier1 = [
  ...organizerOnly,
  requireKycTier(1),
  ensureKycActive,
];
const organizerSubmitGuards = [
  ...organizerOnly,
  ensureKycActive,
  ensureKycValidFor(30),
];

router.use(scopePerRequest);

router.get("/featured", execute("getFeatured"));
router.get("/volunteers-needed", execute("getVolunteerNeeded"));
router.get("/explore", execute("getExploreProjects"));

router.get(
  "/organizer/stats",
  ...organizerOnly,
  execute("getWorkspaceStats"),
);

router.get(
  "/organizer/my-projects",
  ...organizerOnly,
  execute("getWorkspaceProjects"),
);

router.get("/:id/feed/posts", maybeAuthenticate, execute("getFeedPosts"));

router.post(
  "/:id/feed/posts",
  authenticate,
  uploadMedia.single("media"),
  execute("createFeedPost"),
);

router.get(
  "/:id/feed/posts/:postId/comments",
  maybeAuthenticate,
  execute("listFeedComments"),
);

router.post(
  "/:id/feed/posts/:postId/comments",
  authenticate,
  execute("createFeedComment"),
);

router.post(
  "/:id/feed/posts/:postId/like",
  authenticate,
  execute("toggleFeedPostLike"),
);

router.post(
  "/:id/feed/comments/:commentId/like",
  authenticate,
  execute("toggleFeedCommentLike"),
);

router.post(
  "/",
  ...organizerKycTier1,
  validateBody(createDraftSchema),
  execute("createDraft"),
);

router.put(
  "/:id/draft",
  ...organizerKycTier1,
  validateBody(updateDraftSchema),
  execute("updateDraft"),
);

router.get(
  "/:id/draft",
  ...organizerOnly,
  execute("getDraftDetail"),
);

router.post(
  "/:id/submit",
  ...organizerSubmitGuards,
  execute("submitForApproval"),
);

router.post(
  "/:id/report",
  authenticate,
  validateBody(reportProjectSchema),
  execute("reportProject"),
);

router.get("/:id", optionalAuthenticate, execute("getDetail"));

export default router;