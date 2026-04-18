import ApiResponse from '../../core/Response.js';

class DisbursementController {
    constructor({ disbursementService }) {
        this.disbursementService = disbursementService;
    }

    getMyRequests = async (req, res, next) => {
        try {
            const organizerId = req.user.userId;
            const result = await this.disbursementService.getOrganizerRequests(organizerId, req.query);
            return ApiResponse.success(res, result, 'Lấy danh sách yêu cầu giải ngân thành công');
        } catch (error) {
            next(error);
        }
    };


    getRequestDetail = async (req, res, next) => {
        try {
            const { id } = req.params;
            const { userId, role } = req.user;

            const request = await this.disbursementService.getRequestDetail(id, userId, role);
            return ApiResponse.success(res, { request }, 'Lấy chi tiết yêu cầu thành công');
        } catch (error) {
            next(error);
        }
    };

    createRequest = async (req, res, next) => {
        try {
            const organizerId = req.user.userId;
            const data = { ...req.body, organizerId };

            const request = await this.disbursementService.createRequest(data);
            return ApiResponse.created(res, { request }, 'Tạo yêu cầu giải ngân thành công');
        } catch (error) {
            next(error);
        }
    };

    approveRequest = async (req, res, next) => {
        try {
            const { id } = req.params;
            const managerId = req.user.userId;
            const payload = req.body;

            const result = await this.disbursementService.processApproval(id, managerId, payload);
            return ApiResponse.success(res, result, 'Ghi nhận quyết định phê duyệt thành công');
        } catch (error) {
            next(error);
        }
    };

    confirmTransfer = async (req, res, next) => {
        try {
            const { id } = req.params;
            const adminId = req.user.userId;
            const { bankTransactionRef } = req.body;

            const result = await this.disbursementService.confirmManualTransfer(id, adminId, bankTransactionRef);
            return ApiResponse.success(res, result, 'Xác nhận chuyển khoản và hoàn tất giải ngân thành công');
        } catch (error) {
            next(error);
        }
    };

    failTransfer = async (req, res, next) => {
        try {
            const { id } = req.params;
            const adminId = req.user.userId;
            const { reason } = req.body;

            const result = await this.disbursementService.failManualTransfer(id, adminId, reason);
            return ApiResponse.success(res, result, 'Đã ghi nhận lỗi chuyển khoản và phong tỏa tài khoản ngân hàng của Organizer');
        } catch (error) {
            next(error);
        }
    };

    updateBankAccount = async (req, res, next) => {
        try {
            const { id } = req.params;
            const organizerId = req.user.userId;
            const result = await this.disbursementService.updateHoldRequestBankAccount(id, organizerId, req.body);
            return ApiResponse.success(res, result, 'Cập nhật tài khoản ngân hàng thành công. Yêu cầu đã được đẩy lại cho Kế toán.');
        } catch (error) {
            next(error);
        }
    };
}

export default DisbursementController;