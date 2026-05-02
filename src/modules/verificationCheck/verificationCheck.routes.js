import { Router } from "express";
import { getContainer } from "../../container/index.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve("verificationCheckController");
  return controller[action](req, res, next);
};

const verificationCheckAdminRouter = Router();

verificationCheckAdminRouter.post(
  "/:id/verification-checks/mock",
  authenticate,
  authorize("admin"),
  execute("runMockOrganizerRequestCheck")
);

verificationCheckAdminRouter.get(
  "/:id/verification-checks",
  authenticate,
  authorize("admin"),
  execute("listOrganizerRequestChecks")
);

export default verificationCheckAdminRouter;
