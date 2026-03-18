import AppError from '../core/AppError.js';

export const parseJsonFields = (fields) => {
    return (req, res, next) => {
        if (!req.body) return next();

        for (const field of fields) {
            if (req.body[field] && typeof req.body[field] === 'string') {
                try {
                    req.body[field] = JSON.parse(req.body[field]);
                } catch (error) {
                    return next(new AppError(`Định dạng dữ liệu của [${field}] không hợp lệ. Vui lòng gửi JSON String đúng chuẩn.`, 400));
                }
            }
        }
        next();
    };
};