import ApiResponse from '../../core/Response.js';
import OrganizerRequestService from './organizerRequest.service.js';

class OrganizerRequestController {
  constructor({ organizerRequestService = new OrganizerRequestService() } = {}) {
    this.organizerRequestService = organizerRequestService;
  }

  submitMyRequest = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.submitMyRequest(
        req.user.userId,
        req.body
      );
      return ApiResponse.created(res, { request }, 'Gửi đơn đăng ký Organizer thành công');
    } catch (error) {
      next(error);
    }
  };

  getMyLatestRequest = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.getMyLatestRequest(req.user.userId);
      return ApiResponse.success(res, { request }, 'Lấy trạng thái đơn Organizer thành công');
    } catch (error) {
      next(error);
    }
  };

  listAdminRequests = async (req, res, next) => {
    try {
      const result = await this.organizerRequestService.listAdminRequests(req.query);
      return ApiResponse.success(res, result, 'Lấy danh sách đơn Organizer thành công');
    } catch (error) {
      next(error);
    }
  };

  getAdminRequestDetail = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.getAdminRequestDetail(req.params.id);
      return ApiResponse.success(res, { request }, 'Lấy chi tiết đơn Organizer thành công');
    } catch (error) {
      next(error);
    }
  };

  approveRequest = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.approveRequest(
        req.params.id,
        req.user.userId
      );
      return ApiResponse.success(res, { request }, 'Duyệt hồ sơ Organizer thành công');
    } catch (error) {
      next(error);
    }
  };

  declineRequest = async (req, res, next) => {
    try {
      const request = await this.organizerRequestService.declineRequest(
        req.params.id,
        req.user.userId,
        req.body.reviewReason
      );
      return ApiResponse.success(res, { request }, 'Từ chối hồ sơ Organizer thành công');
    } catch (error) {
      next(error);
    }
  };
}

export default OrganizerRequestController;