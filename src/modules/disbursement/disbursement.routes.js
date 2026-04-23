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
    updateHoldRequestSchema,
    adminListDisbursementQuerySchema
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
    authorize('Organizer'),
    validateQuery(listRequestsQuerySchema),
    execute('getMyRequests')
);

router.get(
    '/admin/list',
    authenticate,
    authorize('admin', 'manager'),
    validateQuery(adminListDisbursementQuerySchema),
    execute('getAdminDisbursementList')
);

router.get(
    '/:id/stream',
    authenticate,
    authorize('Organizer', 'admin', 'manager'),
    validateParams(disbursementParamsSchema),
    execute('streamDisbursement')
);

router.get(
    '/:id',
    authenticate,
    authorize('Organizer', 'admin', 'manager'),
    validateParams(disbursementParamsSchema),
    execute('getRequestDetail')
);

router.post(
    '/',
    authenticate,
    authorize('Organizer'), // Fix role chuẩn lowercase
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
    authorize('Organizer'),
    validateParams(disbursementParamsSchema),
    validateBody(updateHoldRequestSchema),
    execute('updateBankAccount')
);

export default router;
