import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validate.middleware.js";
import {
  reviewIdParamsSchema,
  submitReviewSchema,
} from "./volunteer-engagement.validation.js";

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
  const controller = req.scope.resolve("volunteerEngagementController");
  return controller[action](req, res, next);
};

router.get(
  "/projects/:projectId/reviews",
  authenticate,
  execute("getProjectReviews")
);

router.get(
  "/projects/:projectId/my-review",
  authenticate,
  execute("getMyProjectReview")
);

router.patch(
  "/reviews/:reviewId",
  authenticate,
  validateParams(reviewIdParamsSchema),
  validateBody(submitReviewSchema),
  execute("submitReview")
);

export default router;