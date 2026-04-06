import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import OrganizerRequestController from './organizerRequest.controller.js';
import OrganizerRequestService from './organizerRequest.service.js';
import OrganizerRequestRepository from './organizerRequest.repository.js';
import {
  submitOrganizerRequestSchema,
  declineOrganizerRequestSchema,
} from './organizerRequest.validation.js';

const organizerRequestRepository = new OrganizerRequestRepository();
const organizerRequestService = new OrganizerRequestService({
  organizerRequestRepository,
});
const organizerRequestController = new OrganizerRequestController({
  organizerRequestService,
});

const execute = (action) => (req, res, next) => {
  return organizerRequestController[action](req, res, next);
};

export const organizerRequestUserRouter = Router();
export const organizerRequestAdminRouter = Router();

organizerRequestUserRouter.get('/me', authenticate, execute('getMyLatestRequest'));

organizerRequestUserRouter.post(
  '/',
  authenticate,
  validateBody(submitOrganizerRequestSchema),
  execute('submitMyRequest')
);

organizerRequestAdminRouter.get(
  '/',
  authenticate,
  authorize('admin'),
  execute('listAdminRequests')
);

organizerRequestAdminRouter.get(
  '/:id',
  authenticate,
  authorize('admin'),
  execute('getAdminRequestDetail')
);

organizerRequestAdminRouter.patch(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  execute('approveRequest')
);

organizerRequestAdminRouter.patch(
  '/:id/decline',
  authenticate,
  authorize('admin'),
  validateBody(declineOrganizerRequestSchema),
  execute('declineRequest')
);