import ApiResponse from "../../core/Response.js";

class UserController {
  constructor({ userService }) {
    this.userService = userService;
  }

  getProfile = async (req, res, next) => {
    try {
      const user = await this.userService.getProfile(req.user.userId);
      return ApiResponse.success(res, { user });
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req, res, next) => {
    try {
      const updatedUser = await this.userService.updateProfile(
        req.user.userId,
        req.body,
      );
      return ApiResponse.success(
        res,
        { user: updatedUser },
        "Profile updated successfully",
      );
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const updatedUser = await this.userService.changePassword(
        req.user.userId,
        currentPassword,
        newPassword,
      );
      return ApiResponse.success(
        res,
        { user: updatedUser },
        "Password changed successfully",
      );
    } catch (error) {
      next(error);
    }
  };

  changeAvatar = async (req, res, next) => {
    try {
      const updatedUser = await this.userService.changeAvatar(
        req.user.userId,
        req.file,
      );
      return ApiResponse.success(
        res,
        { user: updatedUser },
        "Avatar updated successfully",
      );
    } catch (error) {
      next(error);
    }
  };

  changeCoverPhoto = async (req, res, next) => {
    try {
      const updatedUser = await this.userService.changeCoverPhoto(
        req.user.userId,
        req.file,
      );
      return ApiResponse.success(
        res,
        { user: updatedUser },
        "Cover photo updated successfully",
      );
    } catch (error) {
      next(error);
    }
  };

  getPublicProfile = async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = await this.userService.getProfile(id);
      return ApiResponse.success(res, { user });
    } catch (error) {
      next(error);
    }
  };
  getSuggestedUsers = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 5;

      // 👇 AN TOÀN: Lấy userId nếu có, không có thì gán null
      const userId = req.user?.userId || req.user?._id || req.user?.id || null;

      const users = await this.userService.getSuggestedUsers(userId, limit);

      return ApiResponse.success(
        res,
        { users },
        "Suggested users fetched successfully",
      );
    } catch (error) {
      next(error);
    }
  };
}

export default UserController;
