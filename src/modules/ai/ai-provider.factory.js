import { AI_PROVIDERS } from './interfaces/ai-provider.constant.js';
import AppError from '../../core/AppError.js';
import GoogleAiProvider from './providers/google-ai.provider.js';
import GroqAiProvider from './providers/groq-ai.provider.js';

const createProviderLogger = (winstonLogger) => {
    const logger = winstonLogger?.getLogger?.() || console;

    return {
        error(message, meta = {}) {
            logger.error(message, { requestId: 'SYSTEM_WORKER', ...meta });
        },
        aiLog({ provider, model, latency, tokens, isFallback = false, errorMsg = null, ...rest }) {
            const payload = {
                type: 'AI_GATEWAY',
                requestId: 'SYSTEM_WORKER',
                provider,
                model,
                latency_ms: latency,
                tokens,
                isFallback,
                ...rest,
            };

            if (errorMsg) {
                logger.error('AI Request Failed', { ...payload, errorMsg });
            } else {
                logger.info('AI Request Success', payload);
            }
        },
    };
};

class AiProviderFactory {
    constructor({ config, winstonLogger }) {
        this.config = config;
        this.providerLogger = createProviderLogger(winstonLogger);
        this.providers = new Map();
    }

    getProvider(providerName) {
        if (!Object.values(AI_PROVIDERS).includes(providerName)) {
            throw new AppError(`AI Provider [${providerName}] is not supported`, 500);
        }

        if (!this.providers.has(providerName)) {
            const deps = { config: this.config, appLogger: this.providerLogger };

            if (providerName === AI_PROVIDERS.GEMINI) {
                this.providers.set(providerName, new GoogleAiProvider(deps));
            } else if (providerName === AI_PROVIDERS.GROQ) {
                this.providers.set(providerName, new GroqAiProvider(deps));
            }
        }

        return this.providers.get(providerName);
    }
}

export default AiProviderFactory;
