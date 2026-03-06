import ApiResponse from '../../core/Response.js';

class MediaController {
  constructor({ mediaService }) {
    this.mediaService = mediaService;
  }

  upload = async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const context = req.body.context || 'general'; 
      const media = await this.mediaService.uploadSingle(req.file, userId, context);

      return ApiResponse.success(res, { media }, 'File uploaded successfully');
    } catch (error) {
      next(error);
    }
  };
}

export default MediaController;