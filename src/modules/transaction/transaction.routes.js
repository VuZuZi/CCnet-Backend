import { Router } from "express";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.middleware.js";
import { donateSchema, getDonationsQuerySchema, projectIdParamSchema, requestRefundSchema, withdrawSchema } from "./transaction.validation.js";

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    try {
        const controller = req.scope.resolve("transactionController");
        return controller[action](req, res, next);
    } catch (error) {
        next(error);
    }
};

router.post(
    "/donate",
    authenticate,
    validateBody(donateSchema),
    execute("donate")
);

router.get(
    "/project/:projectId/donations",
    validateParams(projectIdParamSchema),
    validateQuery(getDonationsQuerySchema),
    execute("getProjectDonors")
);

router.get(
    "/me/donations",
    authenticate,
    validateQuery(getDonationsQuerySchema),
    execute("getMyDonations")
);

router.post(
    "/webhook/payos",
    execute("payosWebhook")
);

router.post(
    "/:id/refund",
    authenticate,
    validateBody(requestRefundSchema),
    execute("requestRefund")
);

router.post(
    "/withdraw",
    authenticate,
    validateBody(withdrawSchema),
    execute("withdrawWallet")
);

export default router;