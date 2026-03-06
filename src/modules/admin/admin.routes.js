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
  getController().getStats(req, res, next),
);

router.get("/users", (req, res, next) =>
  getController().getUsers(req, res, next),
);
router.patch("/users/:id/ban", (req, res, next) =>
  getController().banUser(req, res, next),
);

router.get("/projects", (req, res, next) =>
  getController().getProjects(req, res, next),
);
router.delete("/projects/:id", (req, res, next) =>
  getController().deleteProject(req, res, next),
);

router.get("/reports", (req, res, next) =>
  getController().getReports(req, res, next),
);
router.patch("/reports/:id/resolve", (req, res, next) =>
  getController().resolveReport(req, res, next),
);

router.post("/notifications", (req, res, next) =>
  getController().sendNotification(req, res, next),
);

export default router;
