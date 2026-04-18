import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.middleware.js';
import {
    createDisbursementSchema,
    approveDisbursementSchema,
    confirmTransferSchema,
    disbursementParamsSchema,
    listRequestsQuerySchema,
    failTransferSchema,
    updateHoldRequestSchema
} from './disbursement.validation.js';

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    const controller = req.scope.resolve('disbursementController');
    return controller[action](req, res, next);
};

router.get(
    '/my-requests',
    authenticate,
    authorize('organizer'),
    validateQuery(listRequestsQuerySchema),
    execute('getMyRequests')
);

router.get(
    '/:id',
    authenticate,
    authorize('organizer', 'admin', 'manager'),
    validateParams(disbursementParamsSchema),
    execute('getRequestDetail')
);

router.post(
    '/',
    authenticate,
    authorize('organizer'),
    validateBody(createDisbursementSchema),
    execute('createRequest')
);

router.patch(
    '/:id/approve',
    authenticate,
    authorize('admin', 'manager'),
    validateParams(disbursementParamsSchema),
    validateBody(approveDisbursementSchema),
    execute('approveRequest')
);

router.patch(
    '/:id/transfer',
    authenticate,
    authorize('admin'),
    validateParams(disbursementParamsSchema),
    validateBody(confirmTransferSchema),
    execute('confirmTransfer')
);

router.patch(
    '/:id/transfer/fail',
    authenticate,
    authorize('admin'),
    validateParams(disbursementParamsSchema),
    validateBody(failTransferSchema),
    execute('failTransfer')
);

router.patch(
    '/:id/bank-account',
    authenticate,
    authorize('organizer'),
    validateParams(disbursementParamsSchema),
    validateBody(updateHoldRequestSchema),
    execute('updateBankAccount')
);

export default router;