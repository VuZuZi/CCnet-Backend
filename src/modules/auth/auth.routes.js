import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('authController');
  return controller[action](req, res, next);
};

router.post('/register', execute('register'));
router.post('/verify-otp', execute('verifyOTP'));
router.post('/resend-otp', execute('resendOTP'));
router.post('/login', execute('login'));
router.post('/google', execute('googleLogin')); 

// Token Management 
router.post('/refresh-token', execute('refreshToken'));

// Protected Routes
router.post('/logout', authenticate, execute('logout'));
router.post('/logout-all', authenticate, execute('logoutAll'));
router.get('/me', authenticate, execute('getCurrentUser'));

export default router;