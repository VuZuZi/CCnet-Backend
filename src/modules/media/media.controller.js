import AppError from '../../core/AppError.js';
import ApiResponse from '../../core/Response.js';

class MediaController {
  constructor({ mediaService }) {
    this.mediaService = mediaService;
  }

  upload = async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const context = req.body.context || 'general';

      const clientLocation = {
        lat: req.body.lat || null,
        lng: req.body.lng || null
      };

      const media = await this.mediaService.uploadSingle(req.file, userId, context, clientLocation);

      return ApiResponse.success(res, { media }, 'File uploaded successfully');
    } catch (error) {
      next(error);
    }
  };

  getSignature = async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const context = req.query.context || 'project_cover';

      const signatureData = this.mediaService.getUploadSignature(userId, context);

      return ApiResponse.success(res, signatureData, 'Đã cấp chữ ký tải lên mây thành công');
    } catch (error) {
      next(error);
    }
  };

  uploadSmart = async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const context = req.body.context || 'general';
      const files = req.file ? [req.file] : (req.files || []);

      if (files.length === 0) throw new AppError('Không tìm thấy file để xử lý', 400);

      const clientLocation = {
        lat: req.body.lat || null,
        lng: req.body.lng || null
      };

      const mediaList = await this.mediaService.uploadSmartMultiple(files, userId, context, clientLocation);
      const responseData = req.file ? mediaList[0] : mediaList;

      const hasGPS = req.file
        ? responseData.captureMetadata?.source !== 'NONE'
        : mediaList.every(m => m.captureMetadata?.source !== 'NONE');

      const warning = hasGPS
        ? undefined
        : 'Cảnh báo: Ảnh không chứa siêu dữ liệu tọa độ (GPS). Nếu dùng để nộp báo cáo thực địa, hệ thống sẽ không thể tự động duyệt.';

      return ApiResponse.created(res, {
        media: responseData,
        hasGPS,
        warning
      }, 'Tải lên thành công');
    } catch (error) {
      next(error);
    }
  };

  syncMedia = async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const media = await this.mediaService.syncMediaRecord(userId, req.body);

      return ApiResponse.created(res, { media }, 'Đồng bộ dữ liệu media thành công');
    } catch (error) {
      next(error);
    }
  };

  deleteMedia = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const role = req.user.role;

      await this.mediaService.deleteMedia(id, userId, role);
      return ApiResponse.success(res, null, 'Xóa file thành công');
    } catch (error) {
      next(error);
    }
  };
}

export default MediaController;