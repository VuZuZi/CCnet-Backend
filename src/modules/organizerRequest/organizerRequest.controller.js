import ApiResponse from "../../core/Response.js";

class OrganizerRequestController {
  constructor({ organizerRequestService }) {
    this.organizerRequestService = organizerRequestService;
  }

  submitMyRequest = async (req, res, next) => {
    try {
      const payload = req.body;
      const userId = req.user.userId;

      const requestDoc = await this.organizerRequestService.submitMyRequest(
        userId,
        payload
      );

      const { microDepositAmount, ...safeResponse } = requestDoc;

      return ApiResponse.success(
        res,
        { request: safeResponse },
        "Hồ sơ đã được gửi. Vui lòng theo dõi tiến trình xác minh.",
        201
      );
    } catch (error) {
      next(error);
    }
  };

  getMyLatestRequest = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.getMyLatestRequest(
        req.user.userId
      );
      return ApiResponse.success(
        res,
        { request },
        "Lấy trạng thái đơn Organizer thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  listAdminRequests = async (req, res, next) => {
    try {
      const result = await this.organizerRequestService.listAdminRequests(
        req.query
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách đơn Organizer thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  getAdminRequestDetail = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.getAdminRequestDetail(
        req.params.id
      );
      return ApiResponse.success(
        res,
        { request },
        "Lấy chi tiết đơn Organizer thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  getAdminActionLogs = async (req, res, next) => {
    try {
      const result = await this.organizerRequestService.getAdminActionLogs(
        req.query || {}
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy lịch sử xử lý Organizer thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  verifyMicroDeposit = async (req, res, next) => {
    try {
      const { requestId } = req.params;
      const { amount } = req.body;
      const userId = req.user.userId;

      const updatedRequest =
        await this.organizerRequestService.verifyMicroDeposit(
          userId,
          requestId,
          amount
        );

      return ApiResponse.success(
        res,
        { request: updatedRequest },
        "Xác minh tài khoản ngân hàng thành công. Hồ sơ đang chuyển cho Ban Quản Lý duyệt."
      );
    } catch (error) {
      next(error);
    }
  };

  approveRequest = async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user.userId;
      const { reviewReason } = req.body;

      const result = await this.organizerRequestService.approveRequest(
        id,
        adminId,
        reviewReason
      );

      return ApiResponse.success(
        res,
        { request: result },
        "Duyệt hồ sơ thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  declineRequest = async (req, res, next) => {
    try {
      const { id } = req.params;
      const request = await this.organizerRequestService.declineRequest(
        id,
        req.user.userId,
        req.body.reviewReason
      );
      return ApiResponse.success(
        res,
        { request },
        "Từ chối hồ sơ Organizer thành công"
      );
    } catch (error) {
      next(error);
    }
  };
}

export default OrganizerRequestController;