import ApiResponse from "../../core/Response.js";

class VerificationCheckController {
  constructor({ verificationCheckService }) {
    this.verificationCheckService = verificationCheckService;
  }

  runMockOrganizerRequestCheck = async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminUserId = req.user.userId;

      const check =
        await this.verificationCheckService.runMockOrganizerRequestCheck({
          organizerRequestId: id,
          adminUserId,
        });

      return ApiResponse.success(
        res,
        { check },
        "Đã chạy mô phỏng đối chiếu nội bộ. Kết quả không ảnh hưởng quyết định phê duyệt.",
        201
      );
    } catch (error) {
      next(error);
    }
  };

  listOrganizerRequestChecks = async (req, res, next) => {
    try {
      const { id } = req.params;

      const checks =
        await this.verificationCheckService.listOrganizerRequestChecks(id);

      return ApiResponse.success(
        res,
        { checks },
        "Lấy lịch sử đối chiếu mô phỏng thành công."
      );
    } catch (error) {
      next(error);
    }
  };
}

export default VerificationCheckController;
