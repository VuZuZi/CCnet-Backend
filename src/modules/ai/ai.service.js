import AppError from '../../core/AppError.js';
import { AI_PROVIDERS } from './interfaces/ai-provider.constant.js';

class AiService {
    constructor({ aiProviderFactory, appLogger }) {
        this.aiProviderFactory = aiProviderFactory;
        this.logger = appLogger;
    }

    async _pingProvider(providerName) {
        try {
            const provider = this.aiProviderFactory.getProvider(providerName);
            return await provider.ping();
        } catch (error) {
            return { status: 'FAILED', provider: providerName, errorMsg: error.message };
        }
    }

    async checkSystemHealth() {
        const [geminiHealth, groqHealth] = await Promise.all([
            this._pingProvider(AI_PROVIDERS.GEMINI),
            this._pingProvider(AI_PROVIDERS.GROQ)
        ]);

        const isSystemHealthy = geminiHealth.status === 'OK' || groqHealth.status === 'OK';

        if (!isSystemHealthy) {
            this.logger.error('CRITICAL: Toàn bộ hệ thống AI đang sập (Offline)');
        }

        return {
            systemStatus: isSystemHealthy ? 'OPERATIONAL' : 'DEGRADED',
            providers: [geminiHealth, groqHealth]
        };
    }

    async getSupportedModels() {
        const googleProvider = this.aiProviderFactory.getProvider(AI_PROVIDERS.GEMINI);
        const groqProvider = this.aiProviderFactory.getProvider(AI_PROVIDERS.GROQ);

        const [googleModels, groqModels] = await Promise.all([
            typeof googleProvider.getAvailableModels === 'function' ? googleProvider.getAvailableModels() : Promise.resolve([]),
            typeof groqProvider.getAvailableModels === 'function' ? groqProvider.getAvailableModels() : Promise.resolve([])
        ]);

        return {
            google: googleModels,
            groq: groqModels
        };
    }

    async processTextRequest({ userMessage, systemPrompt, modelId }) {
        let provider;

        try {
            provider = this.aiProviderFactory.getProvider(AI_PROVIDERS.GEMINI);
            return await provider.generateText({ userMessage, systemPrompt, modelId });

        } catch (primaryError) {
            this.logger.warn('Gemini Offline/Overloaded. Triggering Fallback to Groq...', {
                originalError: primaryError.message
            });

            try {
                provider = this.aiProviderFactory.getProvider(AI_PROVIDERS.GROQ);
                const fallbackModelId = 'llama3-8b-8192';

                const result = await provider.generateText({
                    userMessage,
                    systemPrompt,
                    modelId: fallbackModelId
                });

                return { ...result, isFallbackUsed: true };

            } catch (fallbackError) {
                this.logger.error('Circuit Breaker OPEN: All AI Providers failed', {
                    primaryError: primaryError.message,
                    fallbackError: fallbackError.message
                });

                throw new AppError('Hệ thống xử lý AI hiện đang quá tải. Vui lòng thử lại sau ít phút.', 503);
            }
        }
    }
}

export default AiService;