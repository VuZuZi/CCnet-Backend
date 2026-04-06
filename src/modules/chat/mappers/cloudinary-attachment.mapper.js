export function mapCloudinaryAttachment(file, uploadResult) {
  return {
    url: uploadResult?.secure_url || uploadResult?.url || "",
    publicId: uploadResult?.public_id || "",
    resourceType: uploadResult?.resource_type || "",
    format: uploadResult?.format || "",
    filename: file?.originalname || "",
    mimetype: file?.mimetype || "",
    originalName: file?.originalname || "",
    size: Number(file?.size || uploadResult?.bytes || 0),
    width: Number(uploadResult?.width || 0) || null,
    height: Number(uploadResult?.height || 0) || null,
  };
}