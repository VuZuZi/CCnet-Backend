import mongoose from 'mongoose';

const captureMetadataSchema = new mongoose.Schema(
  {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    capturedAt: { type: Date, default: null },
    source: {
      type: String,
      enum: ['EXIF', 'CLIENT', 'MIXED', 'NONE'],
      default: 'NONE'
    }
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    publicId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    blurHash: { type: String, default: null },
    captureMetadata: {
      type: captureMetadataSchema,
      default: () => ({})
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    context: {
      type: String,
      enum: ['avatar', 'post', 'comment', 'general', 'cover', 'project_document', 'project_cover', 'organizer_kyc', 'milestone_evidence'],
      default: 'general'
    }
  },
  { timestamps: true }
);

const Media = mongoose.model('Media', mediaSchema);
export default Media;