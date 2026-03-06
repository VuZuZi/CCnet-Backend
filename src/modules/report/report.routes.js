import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import reportController from "./report.controller.js";

const router = express.Router({ mergeParams: true });

router.post("/", authenticate, (req, res, next) => {
  req.body.target_ref = req.params.postId;
  req.body.target_type = "post";
  return reportController.createReport(req, res, next);
});

export default router;
