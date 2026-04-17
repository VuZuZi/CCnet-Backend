import { Router } from "express";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.middleware.js";
import {
    approveClaimSchema,
    donateSchema,
    getDonationsQuerySchema,
    getSuspenseQuerySchema,
    projectIdParamSchema,
    requestRefundSchema,
    submitClaimSchema,
    transactionIdParamSchema,
    updateMessageSchema,
    withdrawSchema
} from "./transaction.validation.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";

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
    "/:id/stream",
    authenticate,
    validateParams(transactionIdParamSchema),
    execute("streamTransaction")
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
    "/webhook/sepay",
    execute("sepayWebhook")
);

router.get(
    "/:id/status",
    authenticate,
    validateParams(transactionIdParamSchema),
    execute("getTransactionStatus")
);

router.post(
    "/:id/refund",
    authenticate,
    validateParams(transactionIdParamSchema),
    validateBody(requestRefundSchema),
    execute("requestRefund")
);

router.post(
    "/withdraw",
    authenticate,
    validateBody(withdrawSchema),
    execute("withdrawWallet")
);

router.post(
    "/claims",
    authenticate,
    validateBody(submitClaimSchema),
    execute("submitClaim")
);

router.get(
    "/admin/suspense",
    authenticate,
    adminMiddleware,
    validateQuery(getSuspenseQuerySchema),
    execute("getSuspenseTransactions")
);

router.post(
    "/admin/suspense/:id/approve",
    authenticate,
    adminMiddleware,
    validateParams(transactionIdParamSchema),
    validateBody(approveClaimSchema),
    execute("approveSuspenseClaim")
);

router.patch(
    "/:id/message",
    authenticate,
    validateParams(transactionIdParamSchema),
    validateBody(updateMessageSchema),
    execute("updateMessage")
);

router.patch(
    "/:id/intent",
    authenticate,
    validateParams(transactionIdParamSchema),
    execute("confirmPaymentIntent")
);

export default router;