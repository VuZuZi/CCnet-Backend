import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { getContainer } from "../../container/index.js";
import reportRoutes from "../report/report.routes.js";

const router = express.Router();

router.get("/", (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.getAllPosts(req, res, next);
});

router.get("/:id", (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.getPostById(req, res, next);
});

router.post("/", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.createPost(req, res, next);
});

router.post("/:id/like", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.toggleLike(req, res, next);
});

router.post("/:id/dislike", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.toggleDislike(req, res, next);
});

router.post("/:id/comment", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.addComment(req, res, next);
});

router.use("/:postId/report", authenticate, reportRoutes);

export default router;
