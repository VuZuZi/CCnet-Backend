import { Router } from "express";
import { getContainer } from "../../container/index.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import {
  submitOrganizerRequestSchema,
  approveOrganizerRequestSchema,
  declineOrganizerRequestSchema,
  verifyDepositSchema,
} from "./organizerRequest.validation.js";

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve("organizerRequestController");
  return controller[action](req, res, next);
};

export const organizerRequestUserRouter = Router();
export const organizerRequestAdminRouter = Router();

organizerRequestUserRouter.get("/me", authenticate, execute("getMyLatestRequest"));

organizerRequestUserRouter.post(
  "/",
  authenticate,
  validateBody(submitOrganizerRequestSchema),
  execute("submitMyRequest")
);

organizerRequestUserRouter.post(
  "/:requestId/verify-deposit",
  authenticate,
  validateBody(verifyDepositSchema),
  execute("verifyMicroDeposit")
);

organizerRequestAdminRouter.get(
  "/",
  authenticate,
  authorize("admin"),
  execute("listAdminRequests")
);

organizerRequestAdminRouter.get(
  "/logs",
  authenticate,
  authorize("admin"),
  execute("getAdminActionLogs")
);

organizerRequestAdminRouter.get(
  "/:id",
  authenticate,
  authorize("admin"),
  execute("getAdminRequestDetail")
);

organizerRequestAdminRouter.patch(
  "/:id/approve",
  authenticate,
  authorize("admin"),
  validateBody(approveOrganizerRequestSchema),
  execute("approveRequest")
);

organizerRequestAdminRouter.patch(
  "/:id/decline",
  authenticate,
  authorize("admin"),
  validateBody(declineOrganizerRequestSchema),
  execute("declineRequest")
);