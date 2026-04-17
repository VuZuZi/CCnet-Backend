export const BANK_ACCOUNT_STATUS = {
    ACTIVE: 'ACTIVE',
    DEPRECATED: 'DEPRECATED',
    LOCKED: 'LOCKED',
    FLAGGED: 'FLAGGED'
};

export const SUPPORTED_BANKS = {
    VIETINBANK: { code: 'ICB', bin: '970415', shortName: 'VietinBank' },
    VIETCOMBANK: { code: 'VCB', bin: '970436', shortName: 'Vietcombank' },
    MB: { code: 'MB', bin: '970422', shortName: 'MBBank' },
    TECHCOMBANK: { code: 'TCB', bin: '970407', shortName: 'Techcombank' },
    BIDV: { code: 'BIDV', bin: '970418', shortName: 'BIDV' },
    AGRIBANK: { code: 'VBA', bin: '970405', shortName: 'Agribank' },
    ACB: { code: 'ACB', bin: '970416', shortName: 'ACB' },
    TPBANK: { code: 'TPB', bin: '970423', shortName: 'TPBank' },
    VPBANK: { code: 'VPB', bin: '970432', shortName: 'VPBank' },
    SACOMBANK: { code: 'STB', bin: '970403', shortName: 'Sacombank' },
    VIB: { code: 'VIB', bin: '970441', shortName: 'VIB' },
    HDBANK: { code: 'HDB', bin: '970437', shortName: 'HDBank' },
};

export const getBankByShortName = (shortName) => {
    if (!shortName) return null;
    return Object.values(SUPPORTED_BANKS).find(
        bank => bank.shortName.toLowerCase() === shortName.trim().toLowerCase()
    );
};

export const getSupportedBankNames = () => {
    return Object.values(SUPPORTED_BANKS).map(bank => bank.shortName);
};