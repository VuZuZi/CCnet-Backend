export const toUserResponse = (user) => {
  const u = user.toObject ? user.toObject() : user;

  return {
    id: u._id,
    email: u.email,
    fullName: u.fullName,
    avatar: u.avatar,
    coverPhoto: u.coverPhoto,
    phone: u.phone,
    location: u.location || null,
    headline: u.headline,
    about: u.about,
    skills: u.skills,
    followersCount: u.followersCount,
    followingCount: u.followingCount,
    level: u.level,
    title: u.title,
    role: u.role,
    kyc: u.kyc || null,
    organization: u.organization || null,
    createdAt: u.createdAt,
  };
};