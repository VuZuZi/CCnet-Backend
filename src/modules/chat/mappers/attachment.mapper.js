export function mapUploadedAttachments(files = []) {
  if (!Array.isArray(files)) return [];

  return files.map((file) => ({
    url: `/uploads/${file.filename}`,
    filename: file.filename,
    mimetype: file.mimetype,
    originalName: file.originalname,
    size: file.size,
  }));
}