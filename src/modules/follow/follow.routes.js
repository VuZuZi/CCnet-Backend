import { Router } from "express";
import { getContainer } from "../../container/index.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema, listFollowingSchema } from "./follow.validation.js";

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve("followController");
  return controller[action](req, res, next);
};

router.get(
  "/following",
  authenticate,
  validate(listFollowingSchema),
  execute("getMyFollowing"),
);

router.post(
  "/users/:id/follow",
  authenticate,
  validate(idParamSchema),
  execute("followUser"),
);

router.delete(
  "/users/:id/follow",
  authenticate,
  validate(idParamSchema),
  execute("unfollowUser"),
);

router.get(
  "/users/:id/status",
  authenticate,
  validate(idParamSchema),
  execute("statusUser"),
);

router.get("/users/:id/stats", validate(idParamSchema), execute("statsUser"));
router.get("/followers", authenticate, execute("getMyFollowers"));
export default router;
