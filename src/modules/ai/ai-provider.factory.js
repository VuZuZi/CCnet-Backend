import { AI_PROVIDERS } from './interfaces/ai-provider.constant.js';
import AppError from '../../core/AppError.js';

class AiProviderFactory {
    constructor({ googleAiProvider, groqAiProvider }) {
        this.providers = new Map();
        
        this.providers.set(AI_PROVIDERS.GEMINI, googleAiProvider);
        this.providers.set(AI_PROVIDERS.GROQ, groqAiProvider);
    }

    getProvider(providerName) {
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new AppError(`AI Provider [${providerName}] is not supported`, 500);
        }
        return provider;
    }
}

export default AiProviderFactory;