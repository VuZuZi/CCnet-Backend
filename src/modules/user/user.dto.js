export const toUserResponse = (user) => {
    const u = user.toObject ? user.toObject() : user;
    
    return {
        id: u._id, 
        email: u.email,
        fullName: u.fullName,
        avatar: u.avatar,
        isVerified: Boolean(u.isVerified),
        coverPhoto: u.coverPhoto,
        phone: u.phone,
        location: u.location,
        
        headline: u.headline,
        about: u.about,
        
        skills: u.skills,
        
        followersCount: u.followersCount,
        followingCount: u.followingCount,
        level: u.level,
        title: u.title,
        
        role: u.role,
        createdAt: u.createdAt
    };
};
