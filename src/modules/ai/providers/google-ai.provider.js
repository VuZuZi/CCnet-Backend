import { GoogleGenerativeAI } from '@google/generative-ai';
import BaseAiProvider from './base-ai.provider.js';
import { AI_PROVIDERS } from '../interfaces/ai-provider.constant.js';
import AppError from '../../../core/AppError.js';

class GoogleAiProvider extends BaseAiProvider {
    constructor({ config, appLogger }) {
        super();
        this.config = config.ai;
        this.logger = appLogger;
        this.providerName = AI_PROVIDERS.GEMINI;

        if (!this.config.geminiFlashKey && !this.config.geminiProKey) {
            throw new AppError('Google AI key missing in configuration', 500);
        }
    }

    _getApiKey(modelId = '') {
        const modelStr = modelId.toLowerCase();
        if (modelStr.includes('pro') || modelStr.includes('thinking') || modelStr.includes('research')) {
            if (!this.config.geminiProKey) {
                throw new AppError('Google AI key for selected model is missing in configuration', 500);
            }
            return this.config.geminiProKey;
        }

        if (!this.config.geminiFlashKey) {
            throw new AppError('Google AI key for selected model is missing in configuration', 500);
        }
        return this.config.geminiFlashKey;
    }

    async getAvailableModels() {
        try {
            const apiKey = this._getApiKey(this.config.defaultFlashModel);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await response.json();

            if (!data.models) return [];

            return data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => ({
                    name: m.name.replace('models/', ''),
                    displayName: m.displayName,
                    inputTokenLimit: m.inputTokenLimit
                }));
        } catch (error) {
            this.logger.error('[Google AI] Fetch models failed', { errorMsg: error.message });
            return [];
        }
    }

    async generateText({ systemPrompt, userMessage, modelId }) {
        const start = Date.now();
        const targetModel = modelId || this.config.defaultFlashModel;
        const apiKey = this._getApiKey(targetModel);

        try {
            const client = new GoogleGenerativeAI(apiKey);
            const model = client.getGenerativeModel({
                model: targetModel,
                systemInstruction: systemPrompt
            });

            const result = await model.generateContent(userMessage);
            const responseText = result.response.text();

            this.logger.aiLog({
                provider: this.providerName,
                model: targetModel,
                latency: Date.now() - start,
                tokens: result.response.usageMetadata?.totalTokenCount || 0
            });

            return { content: responseText, provider: this.providerName, modelUsed: targetModel };
        } catch (error) {
            throw new AppError(`Google AI Error: ${error.message}`, 502);
        }
    }


    async ping() {
        const modelsToTest = [
            { type: 'WORKHORSE', modelName: this.config.defaultFlashModel },
            { type: 'AUDITOR', modelName: this.config.defaultProModel }
        ];

        const results = await Promise.all(modelsToTest.map(async ({ type, modelName }) => {
            try {
                const client = new GoogleGenerativeAI(this._getApiKey(modelName));
                const model = client.getGenerativeModel({ model: modelName });
                const start = Date.now();
                await model.generateContent('ping');
                return { type, model: modelName, status: 'OK', latency: Date.now() - start };
            } catch (error) {
                return { type, model: modelName, status: 'FAILED', errorMsg: error.message };
            }
        }));

        const isAllHealthy = results.every(r => r.status === 'OK');
        return {
            provider: this.providerName,
            status: isAllHealthy ? 'OK' : 'DEGRADED',
            details: results
        };
    }
}

export default GoogleAiProvider;
