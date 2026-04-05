export function normalizeId(value) {
  if (!value) return '';

  if (typeof value === 'string') return String(value);

  return String(
    value?._id ||
      value?.id ||
      value?.userId?._id ||
      value?.userId ||
      value?.readerId?._id ||
      value?.readerId ||
      value?.user?._id ||
      value?.user?.id ||
      value?.reader?._id ||
      value?.reader?.id ||
      value ||
      ''
  );
}

export function uniqueIds(items = []) {
  return [
    ...new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => normalizeId(item))
        .filter(Boolean)
    ),
  ];
}