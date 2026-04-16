export function buildPagination(page, limit, total) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Number(limit) || 10);

  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export function createEmptyPaginatedResult(page, limit) {
  return {
    items: [],
    pagination: buildPagination(page, limit, 0),
  };
}

export function normalizeAdminActionLogItem(item) {
  return {
    ...item,
    actorName: item?.actorId?.fullName || "",
    actorEmail: item?.actorId?.email || "",
    targetUserName: item?.metadata?.fullName || "",
    targetUserEmail: item?.metadata?.email || "",
    applicantName: item?.metadata?.fullName || "",
    applicantEmail: item?.metadata?.email || "",
    organizationName: item?.metadata?.organizationName || "",
    projectTitle: item?.metadata?.projectTitle || "",
    projectType: item?.metadata?.projectType || "",
    notificationTitle: item?.metadata?.title || "",
    notificationMessage: item?.metadata?.message || "",
    notificationSeverity: item?.metadata?.severity || "",
    notificationTargetType: item?.metadata?.targetType || "",
    previousStatus: item?.previousState?.status || "",
    nextStatus: item?.nextState?.status || "",
    targetIdString: item?.targetId ? String(item.targetId) : "",
  };
}

export function normalizeOrganizerActionLogItem(item) {
  return {
    ...item,
    actorName: item?.actorId?.fullName || "",
    actorEmail: item?.actorId?.email || "",
    applicantName: item?.metadata?.fullName || "",
    applicantEmail: item?.metadata?.email || "",
    organizationName: item?.metadata?.organizationName || "",
  };
}