import AppError from '../../../core/AppError.js';

class BaseAiProvider {
    constructor() {
        if (new.target === BaseAiProvider) {
            throw new AppError('Cannot instantiate Abstract Class BaseAiProvider', 500);
        }
    }

    async generateText(payload) {
        throw new AppError(`Method generateText() not implemented in ${this.constructor.name}`, 500);
    }

    async ping() {
        throw new AppError(`Method ping() not implemented in ${this.constructor.name}`, 500);
    }
}

export default BaseAiProvider;