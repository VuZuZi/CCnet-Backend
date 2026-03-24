import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { adminMiddleware } from '../../middlewares/admin.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createHelpRequestSchema,
  updateHelpRequestSchema,
  getHelpRequestsSchema,
  getHelpRequestByIdSchema,
  deleteHelpRequestSchema,
  verifyHelpRequestSchema,
  assignOrganizerSchema,
  getNearbyRequestsSchema,
} from './helprequest.validation.js';

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
  try {
    if (!req.scope) {
      throw new Error('req.scope is required. Check di.middleware.');
    }
    const controller = req.scope.resolve('helprequestController');

    if (typeof controller[action] !== 'function') {
      throw new Error(`Action [${action}] does not exist in HelpRequestController.`);
    }
    return controller[action](req, res, next);
  } catch (error) {
    next(error);
  }
};

// Public routes - specific paths first
router.get(
  '/urgent',
  execute('getUrgentRequests')
);

router.get(
  '/nearby',
  validate(getNearbyRequestsSchema),
  execute('getNearbyRequests')
);

// Admin stats route (must be before /:id)
router.get(
  '/admin/stats',
  authenticate,
  adminMiddleware,
  execute('getStats')
);

// User's own requests (must be before /:id)
router.get(
  '/user/my-requests',
  authenticate,
  validate(getHelpRequestsSchema),
  execute('getMyHelpRequests')
);

// Public list route
router.get(
  '/',
  validate(getHelpRequestsSchema),
  execute('getHelpRequests')
);

// Create help request
router.post(
  '/',
  authenticate,
  validate(createHelpRequestSchema),
  execute('createHelpRequest')
);

// Single help request by ID - placed after specific routes
router.get(
  '/:id',
  validate(getHelpRequestByIdSchema),
  execute('getHelpRequestById')
);

router.put(
  '/:id',
  authenticate,
  validate(updateHelpRequestSchema),
  execute('updateHelpRequest')
);

router.delete(
  '/:id',
  authenticate,
  validate(deleteHelpRequestSchema),
  execute('deleteHelpRequest')
);

router.patch(
  '/:id/cancel',
  authenticate,
  validate(getHelpRequestByIdSchema),
  execute('cancelHelpRequest')
);

router.patch(
  '/:id/complete',
  authenticate,
  validate(getHelpRequestByIdSchema),
  execute('completeHelpRequest')
);

// Admin routes for specific help request
router.patch(
  '/:id/verify',
  authenticate,
  adminMiddleware,
  validate(verifyHelpRequestSchema),
  execute('verifyHelpRequest')
);

router.patch(
  '/:id/assign',
  authenticate,
  adminMiddleware,
  validate(assignOrganizerSchema),
  execute('assignOrganizer')
);

export default router;
