import ApiResponse from '../../core/Response.js';

class AdminFinanceController {
    constructor({ adminFinanceService }) {
        this.adminFinanceService = adminFinanceService;
    }

    getSummary = async (req, res, next) => {
        try {
            const result = await this.adminFinanceService.getProjectFinancialSummary(req.query);
            return ApiResponse.success(res, result, 'Lấy tổng quan tài chính dự án thành công');
        } catch (error) {
            next(error);
        }
    };

    getDetail = async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const result = await this.adminFinanceService.getProjectFinancialDetail(projectId);
            return ApiResponse.success(res, result, 'Lấy chi tiết tài chính dự án thành công');
        } catch (error) {
            next(error);
        }
    };
}

export default AdminFinanceController;