import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { uploadAvatar, uploadCover } from '../../middlewares/upload.middleware.js';
import { updateProfileSchema, changePasswordSchema } from './user.validation.js';

const router = Router();

const execute = (action) => (req, res, next) => {
    const container = getContainer();
    const controller = container.resolve('userController');
    return controller[action](req, res, next);
};


router.get('/', authenticate, execute('getProfile'));

router.put(
    '/',
    authenticate,
    validate(updateProfileSchema),
    execute('updateProfile')
);

router.put(
    '/password',
    authenticate,
    validate(changePasswordSchema),
    execute('changePassword')
);

router.put(
    '/avatar',
    authenticate,
    uploadAvatar.single('avatar'),
    execute('changeAvatar')
);

router.put(
    '/cover',
    authenticate,
    uploadCover.single('coverPhoto'),
    execute('changeCoverPhoto')
);

router.get(
    '/:id',
    authenticate,
    execute('getPublicProfile')
);

export default router;