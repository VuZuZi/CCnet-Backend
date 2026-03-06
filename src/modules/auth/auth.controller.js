import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";
import {
  registerSchema,
  verifyOTPSchema,
  loginSchema,
} from "./auth.validation.js";

class AuthController {
  constructor({ authService, config }) {
    this.authService = authService;
    this.config = config;
  }

  register = async (req, res, next) => {
    try {
      const { error, value } = registerSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const result = await this.authService.register(value);
      return ApiResponse.created(
        res,
        result,
        "Registration successful. Please verify OTP.",
      );
    } catch (error) {
      next(error);
    }
  };

  verifyOTP = async (req, res, next) => {
    try {
      const { error, value } = verifyOTPSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const result = await this.authService.verifyOTP(value.userId, value.otp);
      return ApiResponse.success(res, result, "Email verified successfully");
    } catch (error) {
      next(error);
    }
  };

  login = async (req, res, next) => {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const result = await this.authService.login(value.email, value.password);

      this._setRefreshTokenCookie(res, result.tokens.refreshToken);

      return ApiResponse.success(res, result, "Login successful");
    } catch (error) {
      next(error);
    }
  };

  googleLogin = async (req, res, next) => {
    try {
      const { idToken } = req.body;
      if (!idToken) throw new AppError("Google ID Token is required", 400);

      const result = await this.authService.loginWithGoogle(idToken);
      this._setRefreshTokenCookie(res, result.tokens.refreshToken);

      return ApiResponse.success(res, result, "Google Login successful");
    } catch (error) {
      next(error);
    }
  };

  refreshToken = async (req, res, next) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        throw new AppError("Refresh token not found", 401);
      }

      const result = await this.authService.refreshAccessToken(refreshToken);

      this._setRefreshTokenCookie(res, result.refreshToken);

      return ApiResponse.success(
        res,
        { accessToken: result.accessToken },
        "Access token refreshed",
      );
    } catch (error) {
      next(error);
    }
  };

  resendOTP = async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) throw new AppError("Email is required", 400);

      await this.authService.resendOTP(email);

      return ApiResponse.success(
        res,
        null,
        "OTP has been resent to your email",
      );
    } catch (error) {
      next(error);
    }
  };

  logout = async (req, res, next) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      const accessToken = req.headers.authorization?.split(" ")[1];
      const userId = req.user?.userId;

      await this.authService.logout(userId, accessToken, refreshToken);

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: this.config.env === "production",
        sameSite: "strict",
        path: "/",
      });

      return ApiResponse.success(res, null, "Logged out successfully");
    } catch (error) {
      next(error);
    }
  };

  logoutAll = async (req, res, next) => {
    try {
      const result = await this.authService.logoutAll(req.user.userId);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  getCurrentUser = async (req, res, next) => {
    try {
      return ApiResponse.success(res, { user: req.user });
    } catch (error) {
      next(error);
    }
  };

  _setRefreshTokenCookie(res, token) {
    res.cookie("refreshToken", token, {
      httpOnly: true,
      secure: this.config.env === "production",
      sameSite: "strict",
      maxAge: this.config.jwt.refreshExpireSeconds * 1000,
      path: "/",
    });
  }
}

export default AuthController;
