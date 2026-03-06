export const toUserResponse = (user) => {
    const u = user.toObject ? user.toObject() : user;
    
    return {
        id: u._id, 
        email: u.email,
        fullName: u.fullName,
        avatar: u.avatar,
        phone: u.phone,
        location: u.location,
        bio: u.bio,
        skills: u.skills,
        role: u.role,
        createdAt: u.createdAt
    };
};