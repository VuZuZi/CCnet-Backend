import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { idParamSchema, listVolunteeringSchema } from './volunteer.validation.js';
import VolunteerController from './volunteer.controller.js';

const router = Router();

const execute = (action) => (req, res, next) => {
    const container = getContainer();
    const controller = container.resolve('volunteerController');
    return controller[action](req, res, next);
};
console.log("+=====================+");
router.post('/apply/:projectId', VolunteerController.applyVolunteer);
console.log("+=====================+");

console.log(router.post('/apply/:projectId', VolunteerController.applyVolunteer));

router.get(
    '/volunteerer',
    authenticate,
    validate(listVolunteerSchema),
    execute('volunteerer')
);
// router.create();
router.post(
    '/project/:id/aplly',
    authenticate,
    validate(idParamSchema),
    execute('volunteerUser')
);

router.delete(
    '/users/:id/volunteer',
    authenticate,
    validate(idParamSchema),
    execute('unvolunteerUser')
);

router.get(
    '/users/:id/status',
    authenticate,
    validate(idParamSchema),
    execute('statusUser')
);

router.get(
    '/users/:id/stats',
    validate(idParamSchema),
    execute('statsUser')
);

export default router;