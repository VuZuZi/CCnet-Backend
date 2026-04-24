// file: src/middlewares/di.middleware.js
import { v4 as uuidv4 } from 'uuid'; // Import thêm UUID
import { getContainer } from '../container/index.js';
import AppError from '../core/AppError.js';
import { asValue } from 'awilix';

export const scopePerRequest = (req, res, next) => {
    try {
        const container = getContainer();
        req.scope = container.createScope();
        const requestId = req.headers['x-request-id'] || uuidv4();
        req.scope.register({
            currentUser: asValue(req.user || null),
            requestId: asValue(requestId)
        });

        next();
    } catch (error) {
        console.error('[ DI Error - Root Cause]:', error);
        next(new AppError('Lỗi khởi tạo DI Scope Hệ thống', 500));
    }
};