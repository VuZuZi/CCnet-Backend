import fsPromises from 'fs/promises';

export const autoCleanupTempFiles = (req, res, next) => {
    let cleaned = false;

    const cleanup = async () => {
        if (cleaned) return;
        cleaned = true;

        const filesToClean = [];
        
        if (req.file) filesToClean.push(req.file);
        if (req.files) {
            if (Array.isArray(req.files)) filesToClean.push(...req.files);
            else Object.values(req.files).forEach(fArr => filesToClean.push(...fArr));
        }

        if (filesToClean.length === 0) return;

        const unlinkPromises = filesToClean.map(file => 
            fsPromises.unlink(file.path).catch(err => {
                if (err.code !== 'ENOENT') {
                    console.error(`[CTO Warning] Không thể dọn rác file tạm ${file.path}:`, err.message);
                }
            })
        );
        
        await Promise.allSettled(unlinkPromises);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
};