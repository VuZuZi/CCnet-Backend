import crypto from "crypto";

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeLocation = (location = {}) => ({
  type: location?.type || "Point",
  coordinates: Array.isArray(location?.coordinates)
    ? location.coordinates.map((item) => Number(item))
    : [],
  address: String(location?.address || "").trim(),
});

const normalizeMilestone = (milestone = {}) => ({
  milestoneId: String(milestone?.milestoneId || ""),
  title: String(milestone?.title || "").trim(),
  description: String(milestone?.description || "").trim(),
  deliverables: String(milestone?.deliverables || "").trim(),
  targetAmount: Number(milestone?.targetAmount || 0),
  startDate: normalizeDate(milestone?.startDate),
  endDate: normalizeDate(milestone?.endDate),
  location: milestone?.location ? normalizeLocation(milestone.location) : null,
  evidencePolicy: {
    requireFinancial: Boolean(milestone?.evidencePolicy?.requireFinancial),
    requireGeoPhotos: Number(milestone?.evidencePolicy?.requireGeoPhotos || 0),
    requireVolunteerLogs: Boolean(milestone?.evidencePolicy?.requireVolunteerLogs),
  },
});

const normalizeVolunteerRole = (role = {}) => ({
  roleId: String(role?.roleId || ""),
  title: String(role?.title || "").trim(),
  quantity: Number(role?.quantity || 0),
  skillsRequired: Array.isArray(role?.skillsRequired)
    ? role.skillsRequired.map((skill) => String(skill || "").trim()).filter(Boolean)
    : [],
  location: String(role?.location || "").trim(),
  duration: String(role?.duration || "").trim(),
});

const normalizeDocument = (document = {}) => ({
  id: String(document?._id || document?.id || document || ""),
  originalName: String(document?.originalName || "").trim(),
  mimetype: String(document?.mimetype || "").trim(),
  size: Number(document?.size || 0),
  createdAt: normalizeDate(document?.createdAt),
});

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function buildProjectReviewSnapshot(project = {}, organizerTrust = {}) {
  return {
    projectId: String(project?._id || ""),
    organizerId: String(project?.organizerId?._id || project?.organizerId || ""),
    title: String(project?.title || "").trim(),
    description: String(project?.description || "").trim(),
    category: String(project?.category || "").trim(),
    projectType: String(project?.projectType || "").trim(),
    targetAmount: Number(project?.targetAmount || 0),
    location: normalizeLocation(project?.location),
    startDate: normalizeDate(project?.startDate),
    endDate: normalizeDate(project?.endDate),
    beneficiaryInfo: {
      details: String(project?.beneficiaryInfo?.details || "").trim(),
      totalBeneficiaries: Number(project?.beneficiaryInfo?.totalBeneficiaries || 0),
      evidenceMethod: String(project?.beneficiaryInfo?.evidenceMethod || "").trim(),
    },
    milestones: Array.isArray(project?.milestones)
      ? project.milestones.map(normalizeMilestone)
      : [],
    volunteerRoles: Array.isArray(project?.volunteerRoles)
      ? project.volunteerRoles.map(normalizeVolunteerRole)
      : [],
    documents: Array.isArray(project?.documents)
      ? project.documents.map(normalizeDocument)
      : [],
    coverMedia: {
      hasCover: Boolean(project?.coverMedia?.url),
      mediaType: String(project?.coverMedia?.mediaType || "").trim(),
    },
    organizerTrust,
  };
}

export function hashProjectReviewSnapshot(snapshot) {
  return crypto
    .createHash("sha256")
    .update(stableStringify(snapshot))
    .digest("hex");
}
