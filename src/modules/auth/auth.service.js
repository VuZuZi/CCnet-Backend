// src/modules/auth/auth.service.js
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import AppError from '../../core/AppError.js';

class AuthService {
  constructor({ config, redis, userService, tokenRepository, mailProvider }) {
    this.config = config;
    this.redis = redis;
    this.userService = userService;
    this.tokenRepository = tokenRepository;
    this.mailProvider = mailProvider;

    // CreatePostPage Khởi tạo Google Client với fallback
    try {
      this.googleClient = new OAuth2Client(this.config.google.clientId);
    } catch (error) {
      console.warn('⚠️ Google Client init failed:', error.message);
      this.googleClient = null;
    }
  }

  generateAccessToken(user) {
    return jwt.sign(
        {
          userId: user._id,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
          avatar: user.avatar
        },
        this.config.jwt.accessSecret,
        { expiresIn: this.config.jwt.accessExpire }
    );
  }

  generateRefreshToken() {
    return uuidv4();
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.config.jwt.accessSecret);
    } catch (error) {
      throw new AppError('Invalid or expired access token', 401);
    }
  }

  getRefreshTokenExpiry() {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.config.jwt.refreshExpireSeconds);
    return expiresAt;
  }

  async register(userData) {
    const { email, password, fullName } = userData;

    const existingUser = await this.userService.checkEmailExists(email);
    if (existingUser) {
      throw new AppError('Email already registered', 400);
    }

    const user = await this.userService.createUser({
      email,
      password,
      fullName,
      isEmailVerified: false
    });

    await this._sendOTPToUser(user);

    return {
      userId: user._id,
      email: user.email
    };
  }

  async verifyOTP(userId, otp) {
    const otpKey = `otp:${userId}`;
    const storedOTP = await this.redis.get(otpKey);

    if (!storedOTP) throw new AppError('OTP expired or invalid', 400);
    if (storedOTP !== parseInt(otp)) throw new AppError('Invalid OTP', 400);

    const user = await this.userService.updateProfile(userId, { isEmailVerified: true });
    await this.redis.del(otpKey);

    return this._generateAuthResponse(user);
  }

  async resendOTP(email) {
    const user = await this.userService.getUserByEmail(email);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.isEmailVerified) {
      throw new AppError('Account is already verified', 400);
    }

    await this._sendOTPToUser(user);

    return { sent: true };
  }

  async login(email, password) {
    const user = await this.userService.getUserByEmail(email);

    if (!user) throw new AppError('Invalid email or password', 401);

    if (!user.password) {
      throw new AppError('This email is linked to a Google account. Please login with Google.', 400);
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) throw new AppError('Invalid email or password', 401);

    if (!user.isEmailVerified) throw new AppError('Please verify your email first', 403);
    if (!user.isActive || user.status === 'banned') {
      throw new AppError('Account is deactivated or banned', 403);
    }

    return this._generateAuthResponse(user);
  }

  async loginWithGoogle(idToken) {
    if (!this.googleClient) {
      throw new AppError('Google authentication is not configured', 500);
    }

    if (!idToken) {
      throw new AppError('Google ID Token is required', 400);
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: idToken,
        audience: this.config.google.clientId,
      });

      const payload = ticket.getPayload();
      const { email, name, sub: googleId, picture, email_verified } = payload;

      if (!email) {
        throw new AppError('No email provided from Google', 400);
      }

      let user = await this.userService.getUserByEmail(email);

      if (user) {
        if (!user.isActive || user.status === 'banned') {
          throw new AppError('Account is deactivated or banned', 403);
        }

        if (!user.googleId) {
          await this.userService.updateProfile(user._id, {
            googleId,
            avatar: user.avatar || picture
          });
          
          user.googleId = googleId;
          if (!user.avatar && picture) user.avatar = picture;
        }
      } else {
        user = await this.userService.createUser({
          email,
          fullName: name || email.split('@')[0],
          googleId,
          avatar: picture || null,
          isEmailVerified: email_verified || true,
          password: null
        });
      }

      return this._generateAuthResponse(user);

    } catch (error) {
      console.error('❌ Google Auth Error:', error.message);

      if (error instanceof AppError) {
        throw error;
      }

      const isInvalidToken = 
        error.message.includes('invalid_token') || 
        error.message.includes('Token used too late') ||
        error.message.includes('Wrong number of segments');

      if (isInvalidToken) {
        throw new AppError('Invalid or expired Google token', 401);
      }

      throw new AppError('Google authentication failed', 401);
    }
  }


  async refreshAccessToken(oldRefreshToken) {
    const tokenDoc = await this.tokenRepository.findToken(oldRefreshToken);
    if (!tokenDoc) throw new AppError('Invalid refresh token', 401);

    await this.tokenRepository.deleteToken(oldRefreshToken);

    if (tokenDoc.expiresAt < new Date()) {
      throw new AppError('Refresh token expired, please login again', 401);
    }

    const user = await this.userService.getUserById(tokenDoc.userId);
    if (!user || !user.isActive || user.status === 'banned') {
      throw new AppError('User not found or deactivated', 403);
    }

    return this._generateAuthResponse(user);
  }

  async logout(userId, accessToken, refreshToken) {
    if (refreshToken) {
      await this.tokenRepository.deleteToken(refreshToken);
    }

    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken);
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          const ttl = decoded.exp - now;

          if (ttl > 0) {
            await this.redis.set(`bl:${accessToken}`, 'revoked', 'EX', ttl);
          }
        }
      } catch (ignored) {
        // Bỏ qua lỗi khi không thể decode token
      }
    }
  }

  async logoutAll(userId) {
    return await this.tokenRepository.deleteAllByUserId(userId);
  }

  async _sendOTPToUser(user) {
    const otp = crypto.randomInt(100000, 999999).toString();
    await this.redis.set(`otp:${user._id}`, otp, 'EX', 300);

    try {
      await this.mailProvider.sendEmail(user.email, 'Verify your account', 'OTP', { otp });
    } catch (err) {
      console.error('Failed to send OTP email:', err);
    }

    if (this.config.env === 'development') {
      console.log(`[DEV ONLY] OTP for ${user.email}: ${otp}`);
    }
  }

  async _generateAuthResponse(user) {
    const userId = user._id || user.id;
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken();
    const expiresAt = this.getRefreshTokenExpiry();

    await this.tokenRepository.saveToken(refreshToken, userId, expiresAt);

    return {
      user: {
        id: userId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    };
  }
}

export default AuthService;