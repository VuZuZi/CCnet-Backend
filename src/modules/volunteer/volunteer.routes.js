import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('volunteerController');

  if (!controller) {
    console.log('❌ Controller not found!');
    return res.status(500).json({ error: 'Controller not found' });
  }

  if (typeof controller[action] !== 'function') {
    console.log(`❌ Action '${action}' not found in controller`);
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

/**
 * USER / VOLUNTEER SELF-SERVICE
 */

// Tạo đơn đăng ký
router.post(
  '/submit',
  authenticate,
  execute('applyVolunteer')
);

// Kiểm tra trạng thái đơn của chính mình theo project
router.get(
  '/application',
  authenticate,
  execute('application')
);

// Lấy các project user đã/support/đăng ký
router.get(
  '/me/projects',
  authenticate,
  execute('getMySupportedProjects')
);

// Cập nhật đơn của chính mình
router.patch(
  '/applications/:id',
  authenticate,
  execute('updateApplication')
);

// Hủy đơn của chính mình
router.patch(
  '/applications/:id/cancel',
  authenticate,
  execute('cancelApplication')
);

/**
 * ORGANIZER / ADMIN REVIEW FLOWS
 */

// Lấy danh sách đơn theo project và status
router.get(
  '/projects/:projectId/:status',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('getProjectPendingApplications')
);

// Lấy danh sách đơn theo project với query status
router.get(
  '/projects/:projectId',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('getProjectApplications')
);

// Duyệt đơn
router.patch(
  '/:id/approve',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('approveVolunteer')
);

// Từ chối đơn
router.patch(
  '/applications/:id/reject',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('rejectVolunteer')
);

// Khôi phục đơn về PENDING
router.patch(
  '/applications/:id/restore',
  authenticate,
  authorizeOrganizerOrAdmin,
  execute('restoreVolunteer')
);

// Stats của user volunteer
router.get(
  '/stats/:id',
  authenticate,
  execute('getStats')
);

export default router;