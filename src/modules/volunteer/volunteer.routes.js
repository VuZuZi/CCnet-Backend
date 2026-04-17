import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('volunteerController');

  if (!controller) {
    return res.status(500).json({ error: 'Controller not found' });
  }

  if (typeof controller[action] !== 'function') {
    return res.status(500).json({ error: `Action ${action} not found` });
  }

  return controller[action](req, res, next);
};

const authorizeOrganizerOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();

  if (role === 'organizer' || role === 'admin') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Bạn không có quyền thực hiện hành động này',
  });
};

router.post('/submit', authenticate, execute('applyVolunteer'));

router.get('/application', authenticate, execute('application'));

router.get('/me/projects', authenticate, execute('getMySupportedProjects'));

router.patch('/applications/:id', authenticate, execute('updateApplication'));

router.patch('/applications/:id/cancel', authenticate, execute('cancelApplication'));

router.patch('/applications/:id/request-withdraw', authenticate, execute('requestWithdraw'));

router.get(
  '/projects/:projectId/:status',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('getProjectApplications')
);

router.get(
  '/projects/:projectId',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('getProjectApplications')
);

router.patch('/:id/approve', authenticate, authorizeOrganizerOrAdmin, execute('approveVolunteer'));

router.patch(
  '/applications/:id/reject',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('rejectVolunteer')
);

router.patch(
  '/applications/:id/restore',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('restoreVolunteer')
);

router.patch(
  '/applications/:id/approve-withdraw',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('approveWithdraw')
);

router.patch(
  '/applications/:id/reject-withdraw',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('rejectWithdraw')
);

router.get('/stats/:id', authenticate, execute('getStats'));

export default router;