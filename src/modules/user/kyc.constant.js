export const KYC_STATUS = {
    UNVERIFIED: 'UNVERIFIED',
    PENDING: 'PENDING',
    VERIFIED: 'VERIFIED',
    EXPIRED: 'EXPIRED',
    LOCKED: 'LOCKED'
};

export const KYC_TIER_LIMITS = {
    0: {
        tier: 0,
        name: 'Unverified',
        maxFundingCap: 0,
        maxConcurrentProjects: 0,
        maxDurationDays: 0,
        canCreateProject: false
    },
    1: {
        tier: 1,
        name: 'KYC cá nhân',
        maxFundingCap: 50_000_000,
        maxConcurrentProjects: 1,
        maxDurationDays: 30,
        canCreateProject: true
    },
    2: {
        tier: 2,
        name: 'Verified Organizer',
        maxFundingCap: 200_000_000,
        maxConcurrentProjects: 3,
        maxDurationDays: 60,
        canCreateProject: true
    },
    3: {
        tier: 3,
        name: 'Business/Organization',
        maxFundingCap: null,
        maxConcurrentProjects: null,
        maxDurationDays: 90,
        canCreateProject: true
    }
};