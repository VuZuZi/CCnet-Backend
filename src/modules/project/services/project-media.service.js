const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return String(value._id || value.id || value);
  return String(value);
};

const formatCoverMedia = (media) => ({
  url: media.url,
  publicId: media.publicId,
  mediaType: media.mimetype?.startsWith("video") ? "video" : "image",
});

const buildMediaInsertPayload = (item, organizerId, context) => ({
  originalName: item.originalName || "unknown_file",
  url: item.url,
  publicId: item.publicId,
  mimetype:
    item.mimetype ||
    (item.mediaType === "video" ? "video/mp4" : "image/jpeg"),
  size: Number(item.size || 0),
  width: Number(item.width || 0),
  height: Number(item.height || 0),
  uploadedBy: organizerId,
  context,
});

class ProjectMediaService {
  constructor({ mediaRepository, jobQueue }) {
    this.mediaRepository = mediaRepository;
    this.jobQueue = jobQueue;
  }

  async processMediaPayload(mediaArray, organizerId, context) {
    const validMediaIds = new Set();
    const newMediaToInsert = [];
    const normalizedMedia = Array.isArray(mediaArray) ? mediaArray : [];
    const idsToCheck = [];
    const newItemsToCheck = [];

    for (const item of normalizedMedia) {
      if (item?._id) {
        idsToCheck.push(item._id);
        continue;
      }

      if (item?.publicId && item?.url) {
        newItemsToCheck.push(item);
      }
    }

    if (idsToCheck.length > 0) {
      const ownedMedia = await this.mediaRepository.findManyByIdsAndOwner(
        idsToCheck,
        organizerId,
      );

      ownedMedia.forEach((media) => {
        validMediaIds.add(String(media._id));
      });
    }

    if (newItemsToCheck.length === 0) {
      return {
        validMediaIds: Array.from(validMediaIds),
        newMediaToInsert,
      };
    }

    const publicIds = newItemsToCheck.map((item) => item.publicId);
    const existingMedias =
      await this.mediaRepository.findManyByPublicIds(publicIds);

    const existingByPublicId = new Map(
      existingMedias.map((media) => [media.publicId, media]),
    );

    for (const item of newItemsToCheck) {
      const existing = existingByPublicId.get(item.publicId);

      if (existing) {
        if (toIdString(existing.uploadedBy) === toIdString(organizerId)) {
          validMediaIds.add(String(existing._id));
        }
        continue;
      }

      newMediaToInsert.push(
        buildMediaInsertPayload(item, organizerId, context),
      );
    }

    return {
      validMediaIds: Array.from(validMediaIds),
      newMediaToInsert,
    };
  }

  async insertProjectMedia({ coverPayload, docsPayload, organizerId }) {
    const { validMediaIds: validCoverIds, newMediaToInsert: newCoverMedia } =
      await this.processMediaPayload(
        coverPayload,
        organizerId,
        "project_cover",
      );

    const { validMediaIds: validDocIds, newMediaToInsert: newDocMedia } =
      await this.processMediaPayload(
        docsPayload,
        organizerId,
        "project_document",
      );

    const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
    const publicIdsToRollback = allNewMediaToInsert
      .map((media) => media.publicId)
      .filter(Boolean);

    return {
      validCoverIds,
      validDocIds,
      allNewMediaToInsert,
      publicIdsToRollback,
    };
  }

  async resolveCoverMedia({ validCoverIds, insertedMedia }) {
    const insertedCover = insertedMedia.find(
      (media) => media.context === "project_cover",
    );

    if (insertedCover) {
      return formatCoverMedia(insertedCover);
    }

    if (validCoverIds.length === 0) {
      return null;
    }

    const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
    return existingCover ? formatCoverMedia(existingCover) : null;
  }

  async queueMediaCleanup(publicIds = []) {
    const ids = publicIds.filter(Boolean);
    if (ids.length === 0) return;

    this.jobQueue
      .addJob("project-maintenance", "cleanup-old-media", { publicIds: ids })
      .catch(() => {});
  }
}

export default ProjectMediaService;