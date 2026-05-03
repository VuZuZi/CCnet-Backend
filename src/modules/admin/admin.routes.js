import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { getContainer } from "../../container/index.js";

const getController = () => {
  const { cradle } = getContainer();
  return cradle.adminController;
};

const router = express.Router();

router.use(authenticate, adminMiddleware);

router.get("/stats", (req, res, next) =>
  getController().getStats(req, res, next)
);

router.get("/users", (req, res, next) =>
  getController().getUsers(req, res, next)
);

router.get("/users/:id", (req, res, next) =>
  getController().getUserDetail(req, res, next)
);

router.patch("/users/:id/ban", (req, res, next) =>
  getController().banUser(req, res, next)
);

router.patch("/users/:id/status", (req, res, next) =>
  getController().updateUserStatus(req, res, next)
);

router.get("/action-logs", (req, res, next) =>
  getController().getActionLogs(req, res, next)
);

router.get("/organizer-action-logs", (req, res, next) =>
  getController().getOrganizerActionLogs(req, res, next)
);

router.get("/projects", (req, res, next) =>
  getController().getProjects(req, res, next)
);

router.get("/projects/:id/review", (req, res, next) =>
  getController().getProjectReview(req, res, next)
);

router.get("/projects/:id/ai-review-runs", (req, res, next) =>
  getController().getProjectAIReviewRuns(req, res, next)
);

router.get("/projects/:id/ai-review-runs/latest", (req, res, next) =>
  getController().getLatestProjectAIReviewRun(req, res, next)
);

router.post("/projects/:id/ai-review-runs/retry", (req, res, next) =>
  getController().retryProjectAIReview(req, res, next)
);

router.get("/projects/:id/review-records", (req, res, next) =>
  getController().getProjectReviewRecords(req, res, next)
);

router.post("/projects/:id/decision", (req, res, next) =>
  getController().decideProject(req, res, next)
);

router.get("/projects/:id", (req, res, next) =>
  getController().getProjectDetail(req, res, next)
);

router.patch("/projects/:id/status", (req, res, next) =>
  getController().updateProjectStatus(req, res, next)
);

router.get("/reports", (req, res, next) =>
  getController().getReports(req, res, next)
);

router.patch("/reports/:id/resolve", (req, res, next) =>
  getController().resolveReport(req, res, next)
);

router.post("/notifications", (req, res, next) =>
  getController().sendNotification(req, res, next)
);

export default router;
