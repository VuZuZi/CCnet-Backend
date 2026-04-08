// src/modules/auth/auth.routes.js
import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { rateLimit } from 'express-rate-limit';

const router = Router();

//  Rate limiting để tránh spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // Giới hạn 5 request
  message: { message: 'Too many requests, please try again later.' },
  skipSuccessfulRequests: true,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts, please try again later.' },
});

const execute = (action) => async (req, res, next) => {
  try {
    const container = getContainer();
    const controller = container.resolve('authController');

    if (!controller || typeof controller[action] !== 'function') {
      throw new Error(`Action ${action} not found in authController`);
    }

    return await controller[action](req, res, next);
  } catch (error) {
    console.error(` Error executing ${action}:`, error.message);
    next(error);
  }
};

// ==================== PUBLIC ROUTES ====================
// Đăng ký tài khoản
router.post('/register', authLimiter, execute('register'));

// Xác thực OTP
router.post('/verify-otp', authLimiter, execute('verifyOTP'));

// Gửi lại OTP
router.post('/resend-otp', authLimiter, execute('resendOTP'));

// Đăng nhập
router.post('/login', loginLimiter, execute('login'));

// Đăng nhập với Google
router.post('/google', authLimiter, execute('googleLogin'));

// Làm mới token
router.post('/refresh-token', execute('refreshToken'));

// Quên mật khẩu - gửi OTP về email
router.post('/forgot-password', authLimiter, execute('forgotPassword'));

// Xác minh OTP để nhận reset token
router.post('/verify-password-otp', authLimiter, execute('verifyPasswordOTP'));

// Đặt lại mật khẩu bằng reset token (sau khi xác minh OTP)
router.post('/reset-password', authLimiter, execute('resetPassword'));

// ==================== PROTECTED ROUTES ====================
// Đăng xuất
router.post('/logout', authenticate, execute('logout'));

// Đăng xuất tất cả thiết bị
router.post('/logout-all', authenticate, execute('logoutAll'));

// Lấy thông tin user hiện tại
router.get('/me', authenticate, execute('getCurrentUser'));

// ==================== ADMIN ROUTES (có thể thêm sau) ====================
// router.get('/users', authenticate, authorize(['ADMIN']), execute('getAllUsers'));

// ==================== SOCIAL ROUTES ====================
// Đăng nhập với Facebook (nếu cần)
// router.post('/facebook', execute('facebookLogin'));

// Đăng nhập với GitHub (nếu cần)
// router.post('/github', execute('githubLogin'));

export default router;