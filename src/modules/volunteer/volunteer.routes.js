import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
// import { idParamSchema, listVolunteeringSchema } from './volunteer.validation.js';
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
    console.log(`✅ Calling controller.${action}`);
    return controller[action](req, res, next);
};
router.post(
    '/submit',
    authenticate,
    execute('applyVolunteer')
);
router.get(
    '/application',
    authenticate,
    execute('application')
)
router.patch(
    '/applications/:id',
    authenticate,
    execute('updateApplication')
);
// route PATCH để hủy application
router.patch(
    '/applications/:id/cancel',
    authenticate,
    execute('cancelApplication')
);

export default router;