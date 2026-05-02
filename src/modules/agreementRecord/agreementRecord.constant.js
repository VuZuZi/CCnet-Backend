export const AGREEMENT_SUBJECT_TYPE = {
  ORGANIZER_ONBOARDING: "ORGANIZER_ONBOARDING",
};

export const AGREEMENT_RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
  VOIDED: "VOIDED",
};

export const ORGANIZER_COMMITMENT_TEMPLATE_V2 = {
  version: "2.0",
  language: "vi",
  title: "Cam kết trách nhiệm — Đăng ký Ban tổ chức trên CCNet",
  sections: [
    {
      code: "TRUTHFUL_INFORMATION",
      title: "Thông tin trung thực",
      body: "Tôi xác nhận mọi thông tin trong hồ sơ là trung thực, đầy đủ và có thể giải trình khi được yêu cầu.",
    },
    {
      code: "TERMS",
      title: "Đại diện đúng tổ chức hoặc nhóm",
      body: "Tôi cam kết chỉ sử dụng hồ sơ này để đại diện đúng tổ chức hoặc nhóm đã khai báo trên CCNet.",
    },
    {
      code: "FINANCIAL_RESPONSIBILITY",
      title: "Trách nhiệm tài chính",
      body: "Tôi cam kết sử dụng tiền, hiện vật hoặc nguồn lực được ủng hộ đúng mục đích đã công bố.",
    },
    {
      code: "TRANSPARENCY_REPORTING",
      title: "Minh bạch báo cáo",
      body: "Tôi cam kết cập nhật tiến độ, bằng chứng và báo cáo minh bạch theo quy định của nền tảng.",
    },
    {
      code: "PLATFORM_ENFORCEMENT",
      title: "Xử lý theo quy trình nền tảng",
      body: "Tôi chấp nhận việc CCNet kiểm tra, tạm dừng hoặc xử lý hồ sơ nếu phát hiện thông tin sai lệch hoặc sử dụng sai mục đích.",
    },
  ],
};
