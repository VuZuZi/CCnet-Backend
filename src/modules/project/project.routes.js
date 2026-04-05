import { Router } from "express";
import { getContainer } from "../../container/index.js";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { maybeAuthenticate } from '../../middlewares/maybeAuth.middleware.js';
import { createDraftSchema, updateDraftSchema } from "./project.validation.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import {
  uploadFiles,
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
        " Bắt buộc phải có req.scope. Kiểm tra lại di.middleware.",
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
router.get("/explore", execute("getExploreProjects"));

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
  execute("getWorkspaceProjects"),
);

router.get('/:id/feed/posts', maybeAuthenticate, execute('getFeedPosts'));
router.post('/:id/feed/posts', authenticate, execute('createFeedPost'));
router.get('/:id/feed/posts/:postId/comments', maybeAuthenticate, execute('listFeedComments'));
router.post('/:id/feed/posts/:postId/comments', authenticate, execute('createFeedComment'));
router.post('/:id/feed/posts/:postId/like', authenticate, execute('toggleFeedPostLike'));
router.post('/:id/feed/comments/:commentId/like', authenticate, execute('toggleFeedCommentLike'));

router.get("/:id", optionalAuthenticate, execute("getDetail"));


// router.post(
//     '/',
//     authenticate,
//     authorize('Organizer'),
//     projectUploads,
//     autoCleanupTempFiles,
//     validateMagicBytes,
//     parseJsonFields(['location', 'milestones', 'volunteerRoles', 'deletedDocumentIds', 'needsVolunteers']),
//     validateBody(createDraftSchema),
//     execute('createDraft')
// );

// router.put(
//     '/:id/draft',
//     authenticate,
//     authorize('Organizer'),
//     projectUploads,
//     autoCleanupTempFiles,
//     validateMagicBytes,
//     parseJsonFields(['location', 'milestones', 'volunteerRoles', 'deletedDocumentIds', 'needsVolunteers']),
//     validateBody(updateDraftSchema),
//     execute('updateDraft')
// );

router.post(
  "/",
  authenticate,
  authorize("Organizer"),
  validateBody(createDraftSchema),
  execute("createDraft"),
);

router.put(
  "/:id/draft",
  authenticate,
  authorize("Organizer"),
  validateBody(updateDraftSchema),
  execute("updateDraft"),
);

router.post(
  "/:id/submit",
  authenticate,
  authorize("Organizer"),
  execute("submitForApproval"),
);

export default router;