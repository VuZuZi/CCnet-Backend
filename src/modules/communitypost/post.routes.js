import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { getContainer } from "../../container/index.js";
import ReportController from "../report/report.controller.js";
import ReportService from "../report/report.service.js";
import ReportRepository from "../report/report.repository.js";
const router = express.Router();

// Get all posts (paginated)
router.get("/", (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.getAllPosts(req, res, next);
});

// Get single post
router.get("/:id", (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.getPostById(req, res, next);
});

// Create post
router.post("/", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.createPost(req, res, next);
});

// Like a post
router.post("/:id/like", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.toggleLike(req, res, next);
});

// Dislike a post
router.post("/:id/dislike", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.toggleDislike(req, res, next);
});

// Add comment
router.post("/:id/comment", authenticate, (req, res, next) => {
  const { cradle } = getContainer();
  return cradle.postController.addComment(req, res, next);
});

router.post("/:id/report", authenticate, (req, res, next) => {
  const { cradle } = getContainer();

  // Manual Wiring
  req.body.target_ref = req.params.id;
  req.body.target_type = "post";

  const repo = new ReportRepository();
  const service = new ReportService({ reportRepository: repo });
  const controller = new ReportController({ reportService: service });

  return controller.createReport(req, res, next);
});

export default router;
