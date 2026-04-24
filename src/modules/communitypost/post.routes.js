import { Router } from "express";
import { getContainer } from "../../container/index.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { optionalAuthenticate } from "../../middlewares/optionalAuth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { PostValidation } from "./post.validation.js";

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve("postController");
  return controller[action](req, res, next);
};

router.get(
  "/",
  optionalAuthenticate,
  validate(PostValidation.pagination),
  execute("getNewsFeed"),
);

router.get(
  "/saved/all",
  authenticate,
  validate(PostValidation.pagination),
  execute("getSavedPosts"),
);

router.get(
  "/:id",
  optionalAuthenticate,
  validate(PostValidation.paramsId),
  execute("getPostById"),
);

router.get(
  "/:id/comments",
  optionalAuthenticate,
  validate(PostValidation.pagination),
  execute("getComments"),
);

router.post(
  "/",
  authenticate,
  upload.array("images", 5),
  validate(PostValidation.createPost),
  execute("createPost"),
);

router.patch(
  "/:id",
  authenticate,
  upload.array("images", 5),
  validate(PostValidation.updatePost),
  execute("updatePost"),
);

router.delete(
  "/:id",
  authenticate,
  validate(PostValidation.paramsId),
  execute("deletePost"),
);

router.post(
  "/:id/save",
  authenticate,
  validate(PostValidation.paramsId),
  execute("toggleSavePost"),
);

router.post(
  "/:id/reaction",
  authenticate,
  validate(PostValidation.toggleReaction),
  execute("toggleReaction"),
);

router.post(
  "/:id/comments",
  authenticate,
  validate(PostValidation.addComment),
  execute("addComment"),
);

router.post(
  "/:id/comments/:commentId/reaction",
  authenticate,
  validate(PostValidation.toggleCommentReaction),
  execute("toggleCommentReaction"),
);

router.post(
  "/:id/report",
  authenticate,
  validate(PostValidation.reportPost),
  execute("reportPost"),
);

export default router;
