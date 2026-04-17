import ApiResponse from '../../core/Response.js';

class MilestoneEvidenceController {
    constructor({ milestoneEvidenceService }) {
        this.milestoneEvidenceService = milestoneEvidenceService;
    }

    getMyEvidence = async (req, res, next) => {
        try {
            const organizerId = req.user.userId;
            const result = await this.milestoneEvidenceService.getOrganizerEvidenceList(organizerId, req.query);
            return ApiResponse.success(res, result, 'Lấy danh sách báo cáo nghiệm thu thành công');
        } catch (error) {
            next(error);
        }
    };

    getEvidenceDetail = async (req, res, next) => {
        try {
            const { id } = req.params;
            const { userId, role } = req.user;

            const evidence = await this.milestoneEvidenceService.getEvidenceDetail(id, userId, role);
            return ApiResponse.success(res, { evidence }, 'Lấy chi tiết báo cáo nghiệm thu thành công');
        } catch (error) {
            next(error);
        }
    };

    submitEvidence = async (req, res, next) => {
        try {
            const organizerId = req.user.userId;
            const data = { ...req.body, organizerId };

            const evidence = await this.milestoneEvidenceService.submitEvidence(data);
            return ApiResponse.created(res, { evidence }, 'Nộp bằng chứng nghiệm thu thành công');
        } catch (error) {
            next(error);
        }
    };

    reviewEvidence = async (req, res, next) => {
        try {
            const { id } = req.params;
            const reviewerId = req.user.userId;
            const payload = req.body;

            const result = await this.milestoneEvidenceService.reviewEvidence(id, reviewerId, payload);
            return ApiResponse.success(res, result, 'Đánh giá bằng chứng thành công');
        } catch (error) {
            next(error);
        }
    };

    getPublicEvidence = async (req, res, next) => {
        try {
            const { projectId, milestoneId } = req.params;
            
            const result = await this.milestoneEvidenceService.getPublicEvidence(projectId, milestoneId);
            
            return ApiResponse.success(
                res, 
                result, 
                'Lấy bằng chứng nghiệm thu minh bạch thành công'
            );
        } catch (error) {
            next(error);
        }
    };
}

export default MilestoneEvidenceController;