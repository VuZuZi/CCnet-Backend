// backend/src/modules/volunteer/volunteer.routes.js
import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import VolunteerController from './volunteer.controller.js';
import multer from 'multer';

const router = Router();

const execute = (action) => (req, res, next) => {
    const container = getContainer();
    const controller = container.resolve('volunteerController');
    if (!controller) {
        console.log("❌ Controller not found!");
        return res.status(500).json({ error: 'Controller not found' });
    }
    if (typeof controller[action] !== 'function') {
        console.log(`❌ Action '${action}' not found in controller`);
        return res.status(500).json({ error: `Action ${action} not found` });
    }
    return controller[action](req, res, next);
};

// Tạo đơn đăng ký
router.post(
    '/submit',
    authenticate,
    execute('applyVolunteer')
);

// Kiểm tra trạng thái đơn
router.get(
    '/application',
    authenticate,
    execute('application')
);

// Cập nhật đơn
router.patch(
    '/applications/:id',
    authenticate,
    execute('updateApplication')
);

// Hủy đơn
router.patch(
    '/applications/:id/cancel',
    authenticate,
    execute('cancelApplication')
);

// ✅ Lấy danh sách đơn đang chờ của project
router.get(
    '/projects/:projectId/:status',  // ✅ Thêm :projectId
    authenticate,
    execute('getProjectPendingApplications')      // ✅ Đúng tên method
);

// Duyệt đơn
router.patch(
    '/:id/approve',
    authenticate,
    execute('approveVolunteer')
);

// Từ chối đơn
router.patch(
    '/applications/:id/reject',
    authenticate,
    execute('rejectVolunteer')
);
// restore
router.patch(
    '/applications/:id/restore',
    authenticate,
    execute('restoreVolunteer')
);


export default router;