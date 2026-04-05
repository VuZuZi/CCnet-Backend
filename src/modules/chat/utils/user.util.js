export function getUserDisplayName(userLike) {
  if (!userLike) return 'Thành viên';

  return (
    userLike.fullName ||
    userLike.username ||
    userLike.email ||
    userLike.name ||
    userLike.user?.fullName ||
    userLike.user?.username ||
    userLike.user?.email ||
    userLike.user?.name ||
    'Thành viên'
  );
}

export function getDisplayName(userLike) {
  return getUserDisplayName(userLike);
}