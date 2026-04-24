import ApiResponse from '../../core/Response.js';

class AiController {
    constructor({ aiService }) {
        this.aiService = aiService;
    }

    checkHealth = async (req, res, next) => {
        try {
            const healthStatus = await this.aiService.checkSystemHealth();
            return ApiResponse.success(res, healthStatus, 'AI Gateway Health Status');
        } catch (error) {
            next(error);
        }
    };

    testChat = async (req, res, next) => {
        try {
            const { userMessage, systemPrompt, modelId } = req.body;
            
            const result = await this.aiService.processTextRequest({
                userMessage,
                systemPrompt,
                modelId
            });

            return ApiResponse.success(res, result, 'AI Request Processed Successfully');
        } catch (error) {
            next(error);
        }
    };

    getAvailableModels = async (req, res, next) => {
        try {
            const models = await this.aiService.getSupportedModels();
            return ApiResponse.success(res, models, 'Danh sách các Model Gemini hiện có');
        } catch (error) {
            next(error);
        }
    };
}

export default AiController;