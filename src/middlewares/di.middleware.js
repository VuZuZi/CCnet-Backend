import { getContainer } from '../container/index.js';
import AppError from '../core/AppError.js';
import { asValue } from 'awilix';

export const scopePerRequest = (req, res, next) => {
    try {
        const container = getContainer();
        
        req.scope = container.createScope();
        
        req.scope.register({
            currentUser: asValue(req.user || null)
        });

        next();
    } catch (error) {
        console.error('[CTO DI Error - Root Cause]:', error);
        next(new AppError('Lỗi khởi tạo DI Scope Hệ thống', 500));
    }
};