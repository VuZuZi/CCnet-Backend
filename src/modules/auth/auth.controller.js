// src/modules/auth/auth.controller.js
import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";
import {
    registerSchema,
    verifyOTPSchema,
    loginSchema,
} from "./auth.validation.js";

class AuthController {
    constructor({ authService, userService, config }) {
        this.authService = authService;
        this.userService = userService;
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

            this._setRefreshTokenCookie(res, result.refreshToken);

            return ApiResponse.success(res, {
                user: result.user,
                tokens: { accessToken: result.accessToken }
            }, "Email verified successfully");
        } catch (error) {
            next(error);
        }
    };

    login = async (req, res, next) => {
        try {
            const { error, value } = loginSchema.validate(req.body);
            if (error) throw new AppError(error.details[0].message, 400);

            const result = await this.authService.login(value.email, value.password);
            this._setRefreshTokenCookie(res, result.refreshToken);

            return ApiResponse.success(res, {
                user: result.user,
                tokens: { accessToken: result.accessToken }
            }, "Login successful");
        } catch (error) {
            next(error);
        }
    };

    //  Cập nhật googleLogin để nhận credential (từ frontend)
    googleLogin = async (req, res, next) => {
        try {
            // Frontend gửi credential (idToken) từ Google
            const { credential, idToken } = req.body;
            const token = credential || idToken;

            if (!token) {
                throw new AppError("Google ID Token is required", 400);
            }

            const result = await this.authService.loginWithGoogle(token);
            this._setRefreshTokenCookie(res, result.refreshToken);

            return ApiResponse.success(res, {
                user: result.user,
                tokens: { accessToken: result.accessToken }
            }, "Google Login successful");
        } catch (error) {
            console.error('❌ Google login error:', error.message);
            next(error);
        }
    };

    refreshToken = async (req, res, next) => {
        try {
            const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

            if (!refreshToken) {
                throw new AppError("Refresh token not found", 401);
            }

            const result = await this.authService.refreshAccessToken(refreshToken);

            this._setRefreshTokenCookie(res, result.refreshToken);

            return ApiResponse.success(
                res,
                { accessToken: result.accessToken },
                "Access token refreshed"
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
            const refreshToken = req.cookies?.refreshToken;
            const accessToken = req.headers.authorization?.split(" ")[1];
            const userId = req.user?.userId;

            await this.authService.logout(userId, accessToken, refreshToken);

            const sameSite = this.config.env === "production" ? "none" : "lax";
            res.clearCookie("refreshToken", {
                httpOnly: true,
                secure: this.config.env === "production",
                sameSite,
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
            const freshUser = await this.userService.getProfile(req.user.userId);
            return ApiResponse.success(res, { user: freshUser });
        } catch (error) {
            next(error);
        }
    };

    forgotPassword = async (req, res, next) => {
        try {
            const { email } = req.body;
            if (!email) throw new AppError('Email is required', 400);
            await this.authService.forgotPassword(email);
            return ApiResponse.success(
                res, null,
                'If that email exists, a password reset OTP has been sent.'
            );
        } catch (error) { next(error); }
    };

    verifyPasswordOTP = async (req, res, next) => {
        try {
            const { email, otp } = req.body;
            if (!email || !otp) throw new AppError('Email and OTP code are required', 400);
            const result = await this.authService.verifyPasswordOTP(email, otp);
            return ApiResponse.success(
                res,
                { resetToken: result.resetToken },
                'OTP verified. You can now set your new password.'
            );
        } catch (error) { next(error); }
    };

    resetPassword = async (req, res, next) => {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) throw new AppError('Token and new password are required', 400);
            if (newPassword.length < 6) throw new AppError('Password must be at least 6 characters', 400);
            await this.authService.resetPassword(token, newPassword);
            return ApiResponse.success(
                res, null,
                'Password has been reset successfully. Please log in with your new password.'
            );
        } catch (error) { next(error); }
    };

    _setRefreshTokenCookie(res, token) {
        if (!token) return;

        const sameSite = this.config.env === "production" ? "none" : "lax";
        res.cookie("refreshToken", token, {
            httpOnly: true,
            secure: this.config.env === "production",
            sameSite,
            maxAge: this.config.jwt.refreshExpireSeconds * 1000,
            path: "/",
        });
    }
}

export default AuthController;
