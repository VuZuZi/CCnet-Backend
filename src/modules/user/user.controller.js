import ApiResponse from '../../core/Response.js';
import AppError from '../../core/AppError.js';
import { updateProfileSchema } from './user.validation.js';

class UserController {
    constructor({ userService }) {
        this.userService = userService;
    }

    getProfile = async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            if (!userId) throw new AppError('Unauthorized', 401);
            const user = await this.userService.getProfile(userId);
            return ApiResponse.success(res, { user });
        } catch (error) {
            next(error);
        }
    };

    updateProfile = async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            if (!userId) throw new AppError('Unauthorized', 401);

            const { error, value } = updateProfileSchema.validate(req.body);
            if (error) throw new AppError(error.details[0].message, 400);

            const updatedUser = await this.userService.updateProfile(userId, value);
            return ApiResponse.success(res, { user: updatedUser }, 'Profile updated successfully');
        } catch (error) {
            next(error);
        }
    };

    changePassword = async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            if (!userId) throw new AppError('Unauthorized', 401);

            const { currentPassword, newPassword } = req.body;
            if (!currentPassword || !newPassword) {
                throw new AppError('Current password and new password are required', 400);
            }

            const updatedUser = await this.userService.changePassword(userId, currentPassword, newPassword);
            return ApiResponse.success(res, { user: updatedUser }, 'Password changed successfully');
        } catch (error) {
            next(error);
        }
    };
}

export default UserController;