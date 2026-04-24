import OpenAI from 'openai';
import BaseAiProvider from './base-ai.provider.js';
import { AI_PROVIDERS } from '../interfaces/ai-provider.constant.js';
import AppError from '../../../core/AppError.js';

class GroqAiProvider extends BaseAiProvider {
    constructor({ config, appLogger }) {
        super();
        this.config = config.ai;
        this.logger = appLogger;
        this.providerName = AI_PROVIDERS.GROQ;

        if (!this.config.groqKey) {
            throw new AppError('Groq API Key is missing in configuration', 500);
        }

        this.client = new OpenAI({
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: this.config.groqKey
        });
    }

    async getAvailableModels() {
        try {
            const response = await this.client.models.list();
            return response.data.map(m => ({
                name: m.id,
                displayName: m.id,
                provider: this.providerName
            }));
        } catch (error) {
            this.logger.error(`[Groq AI List Models Error]: ${error.message}`);
            return [];
        }
    }

    async generateText({ systemPrompt, userMessage, modelId }) {
        // Sử dụng defaultGroqModel từ config thay cho fallbackModel cũ
        const targetModel = modelId || this.config.defaultGroqModel;
        const start = Date.now();

        try {
            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: userMessage });

            const response = await this.client.chat.completions.create({
                model: targetModel,
                messages,
                temperature: 0.2
            });

            this.logger.aiLog({
                provider: this.providerName,
                model: targetModel,
                latency: Date.now() - start,
                tokens: response.usage?.total_tokens || 0
            });

            return {
                content: response.choices[0]?.message?.content || '',
                provider: this.providerName,
                modelUsed: targetModel
            };
        } catch (error) {
            this.logger.error('Groq AI Generate Error', { errorMsg: error.message });
            throw new AppError(`Groq AI Error: ${error.message}`, 502);
        }
    }

    async ping() {
        try {
            const start = Date.now();
            const { response } = await this.client.chat.completions.create({
                model: this.config.defaultGroqModel,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1
            }).withResponse();

            const headers = response.headers;

            return {
                provider: this.providerName,
                status: 'OK',
                details: [{
                    type: 'FALLBACK',
                    model: this.config.defaultGroqModel,
                    status: 'OK',
                    latency: Date.now() - start,
                    remainingTokens: headers.get('x-ratelimit-remaining-tokens'),
                    remainingRequests: headers.get('x-ratelimit-remaining-requests'),
                    resetIn: headers.get('x-ratelimit-reset-tokens')
                }]
            };
        } catch (error) {
            this.logger.error('Groq AI Ping Failed', { errorMsg: error.message });
            return {
                provider: this.providerName,
                status: 'FAILED',
                details: [{
                    type: 'FALLBACK',
                    model: this.config.defaultGroqModel,
                    status: 'FAILED',
                    errorMsg: error.message
                }]
            };
        }
    }
}

export default GroqAiProvider;