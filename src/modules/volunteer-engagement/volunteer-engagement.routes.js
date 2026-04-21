import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validate.middleware.js";
import {
  projectMilestoneParamsSchema,
  attendanceIdParamsSchema,
  reviewIdParamsSchema,
  updateAttendanceSchema,
  submitReviewSchema,
} from "./volunteer-engagement.validation.js";

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
  const controller = req.scope.resolve("volunteerEngagementController");
  return controller[action](req, res, next);
};

router.get(
  "/projects/:projectId/milestones/:milestoneId/attendance",
  authenticate,
  validateParams(projectMilestoneParamsSchema),
  execute("getAttendanceList")
);

router.post(
  "/projects/:projectId/milestones/:milestoneId/attendance/bootstrap",
  authenticate,
  validateParams(projectMilestoneParamsSchema),
  execute("bootstrapAttendance")
);

router.patch(
  "/attendance/:attendanceId",
  authenticate,
  validateParams(attendanceIdParamsSchema),
  validateBody(updateAttendanceSchema),
  execute("updateAttendance")
);

router.get(
  "/projects/:projectId/milestones/:milestoneId/reviews",
  authenticate,
  validateParams(projectMilestoneParamsSchema),
  execute("getReviewList")
);

router.post(
  "/projects/:projectId/milestones/:milestoneId/reviews/bootstrap",
  authenticate,
  validateParams(projectMilestoneParamsSchema),
  execute("bootstrapReviews")
);

router.patch(
  "/reviews/:reviewId",
  authenticate,
  validateParams(reviewIdParamsSchema),
  validateBody(submitReviewSchema),
  execute("submitReview")
);

export default router;