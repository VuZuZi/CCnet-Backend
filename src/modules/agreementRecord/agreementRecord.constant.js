export const AGREEMENT_SUBJECT_TYPE = {
  ORGANIZER_ONBOARDING: "ORGANIZER_ONBOARDING",
};

export const AGREEMENT_RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
  VOIDED: "VOIDED",
};

export const ORGANIZER_COMMITMENT_VERSION = {
  V2_0: "2.0",
  V2_1: "2.1",
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

export const ORGANIZER_COMMITMENT_TEMPLATE_V2_1 = {
  version: ORGANIZER_COMMITMENT_VERSION.V2_1,
  language: "vi",
  title: "Cam kết trách nhiệm — Đăng ký Ban tổ chức trên CCNet",
  sections: [
    {
      code: "TRUTHFUL_INFO",
      title: "Điều 1. Cam kết về tính trung thực của thông tin",
      body: "Tôi xác nhận mọi thông tin cá nhân, thông tin tổ chức và tài liệu trong hồ sơ đăng ký này là trung thực, chính xác và đầy đủ. Tôi chịu trách nhiệm về tính xác thực của toàn bộ nội dung đã cung cấp và sẵn sàng giải trình khi được yêu cầu.",
    },
    {
      code: "REPRESENTATION",
      title: "Điều 2. Cam kết về tư cách đại diện và hoạt động tổ chức/nhóm",
      body: "Tôi cam kết chỉ sử dụng tài khoản Ban tổ chức để đại diện đúng tổ chức hoặc nhóm đã khai báo. Tôi không mạo danh, không sử dụng danh nghĩa tổ chức khác, và đảm bảo hoạt động đúng phạm vi đã đăng ký trên nền tảng CCNet.",
    },
    {
      code: "PROPER_USE",
      title: "Điều 3. Cam kết sử dụng nền tảng đúng mục đích",
      body: "Tôi cam kết sử dụng nền tảng CCNet đúng mục đích từ thiện, cộng đồng hoặc xã hội như đã khai báo. Tôi không sử dụng nền tảng cho mục đích thương mại cá nhân, gian lận, hoặc bất kỳ hoạt động nào vi phạm quy định của nền tảng.",
    },
    {
      code: "FINANCIAL_USE",
      title: "Điều 4. Cam kết sử dụng nguồn tiền gây quỹ đúng nội dung công bố",
      body: "Tôi cam kết sử dụng toàn bộ tiền, hiện vật hoặc nguồn lực được ủng hộ thông qua nền tảng đúng mục đích đã công bố trong từng dự án. Mọi khoản chi phải minh bạch, có bằng chứng và phù hợp với nội dung đã cam kết với người ủng hộ.",
    },
    {
      code: "PROGRESS_REPORTING",
      title: "Điều 5. Cam kết cập nhật tiến độ, minh chứng và báo cáo",
      body: "Tôi cam kết cập nhật tiến độ dự án, cung cấp bằng chứng hoạt động và nộp báo cáo minh bạch theo đúng quy định và thời hạn của nền tảng CCNet.",
    },
    {
      code: "COOPERATION",
      title: "Điều 6. Cam kết phối hợp với CCNet khi cần xem xét bổ sung",
      body: "Tôi đồng ý phối hợp đầy đủ với đội ngũ CCNet trong quá trình xem xét hồ sơ, kiểm tra hoạt động hoặc giải quyết khiếu nại. Tôi chấp nhận việc CCNet có quyền tạm dừng hoặc thu hồi quyền Ban tổ chức nếu phát hiện vi phạm.",
    },
    {
      code: "ACCOUNTABILITY",
      title: "Điều 7. Cam kết chịu trách nhiệm khi cung cấp sai thông tin hoặc vi phạm nghĩa vụ",
      body: "Tôi hiểu và chấp nhận rằng nếu cung cấp thông tin sai lệch, sử dụng nguồn lực sai mục đích, hoặc vi phạm bất kỳ điều khoản nào trong bản cam kết này, CCNet có quyền xử lý theo quy trình nội bộ bao gồm tạm dừng, thu hồi vai trò Ban tổ chức, và thông báo cho các bên liên quan.",
    },
  ],
};
