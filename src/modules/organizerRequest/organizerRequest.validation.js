import { z } from "zod";
import { ORGANIZATION_TYPE, ORGANIZATION_LEGAL_TYPE } from "./organizerRequest.constant.js";

const EXACT_AGREEMENTS = [
  "TRUTHFUL_INFORMATION",
  "TERMS",
  "FINANCIAL_RESPONSIBILITY",
  "TRANSPARENCY_REPORTING",
  "PLATFORM_ENFORCEMENT"
];

const VN_PHONE_REGEX = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;
const BANK_ACCOUNT_REGEX = /^\d{8,19}$/;
const ACCOUNT_NAME_REGEX = /^[\p{L}\s.'-]{2,150}$/u;
const LEGAL_TYPES_REQUIRING_REGISTRATION = [
  ORGANIZATION_LEGAL_TYPE.COMPANY,
  ORGANIZATION_LEGAL_TYPE.REGISTERED_NGO,
  ORGANIZATION_LEGAL_TYPE.HOUSEHOLD_BUSINESS,
];

const optionalTrimmedString = () =>
  z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().optional());

const pointLocationSchema = z
  .object({
    type: z.literal("Point"),
    coordinates: z.array(z.number()).length(2, "Vui lòng chọn địa chỉ hợp lệ"),
    address: z.string().trim().min(3, "Vui lòng chọn địa chỉ hợp lệ"),
  })
  .refine(
    (value) =>
      Array.isArray(value.coordinates) &&
      value.coordinates.length === 2 &&
      Number.isFinite(value.coordinates[0]) &&
      Number.isFinite(value.coordinates[1]),
    {
      message: "Vui lòng chọn địa chỉ hợp lệ",
      path: ["coordinates"],
    }
  );

const documentPayloadSchema = z
  .object({
    id: z.string().optional(),
    _id: z.string().optional(),
    publicId: z.string().optional(),
    blurHash: z.string().nullable().optional(),
    fileName: z.string().min(1, "Tên file là bắt buộc"),
    mimeType: z.string().min(1, "Loại file là bắt buộc"),
    size: z.coerce.number().min(0).optional(),
    url: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url("URL file không hợp lệ").optional()
    ),
    dataUrl: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1, "dataUrl không được rỗng").optional()
    ),
  })
  .refine((data) => data.url || data.dataUrl, {
    message: "Document bắt buộc phải có url hoặc dataUrl",
    path: ["url"],
  });

export const submitOrganizerRequestSchema = z
  .object({
    fullNameSnapshot: z.string().min(2).max(150).optional(),
    emailSnapshot: z.string().email("Email không hợp lệ").optional(),
    phoneSnapshot: z
      .string()
      .regex(VN_PHONE_REGEX, "Số điện thoại không đúng định dạng Việt Nam")
      .optional()
      .or(z.literal("")),
    locationSnapshot: pointLocationSchema,
    organizationName: z.string().min(2).max(200),
    organizationType: z.enum(Object.values(ORGANIZATION_TYPE)),
    organizationWebsite: z
      .union([z.string().url("Website không hợp lệ"), z.literal("")])
      .optional()
      .default(""),
    organizationLegalType: z.enum(Object.values(ORGANIZATION_LEGAL_TYPE), {
      required_error: "Vui lòng chọn loại hình pháp lý",
      invalid_type_error: "Loại hình pháp lý không hợp lệ",
    }),
    taxCode: optionalTrimmedString(),
    legalRegistrationNumber: optionalTrimmedString(),
    activityDescription: optionalTrimmedString(),
    proofLinks: z.array(
      z.string()
        .trim()
        .url("URL minh chứng không hợp lệ")
        .regex(/^https?:\/\//i, "Chỉ chấp nhận liên kết http hoặc https")
    ).max(5, "Tối đa 5 liên kết").optional(),
    idCardFront: z.preprocess(
      (value) => (value === null ? undefined : value),
      documentPayloadSchema.optional()
    ),
    idCardBack: z.preprocess(
      (value) => (value === null ? undefined : value),
      documentPayloadSchema.optional()
    ),
    selfie: z.preprocess(
      (value) => (value === null ? undefined : value),
      documentPayloadSchema.optional()
    ),
    businessLicense: z.preprocess(
      (value) => (value === null ? undefined : value),
      documentPayloadSchema.optional()
    ),
    bankProof: z.preprocess(
      (value) => (value === null ? undefined : value),
      documentPayloadSchema.optional()
    ),
    bankName: z.string().min(2).max(200),
    bankBin: z.string().trim().max(10).optional(),
    bankAccountNumber: z
      .string()
      .regex(BANK_ACCOUNT_REGEX, "Số tài khoản phải từ 8 đến 19 chữ số"),
    bankAccountName: z
      .string()
      .regex(ACCOUNT_NAME_REGEX, "Tên chủ tài khoản không hợp lệ"),
    notes: z.string().max(1000).optional().default(""),
    commitment: z.object({
      isAccepted: z.boolean().optional(),
      agreements: z.array(z.enum([
        "TRUTHFUL_INFORMATION",
        "TERMS",
        "FINANCIAL_RESPONSIBILITY",
        "TRANSPARENCY_REPORTING",
        "PLATFORM_ENFORCEMENT"
      ])).optional(),
      signerName: z.string().min(2, "Tên người ký tối thiểu 2 ký tự"),
      version: z.string().min(1)
    }).refine(data => {
      // Legacy compatibility: if version is not 2.0 or higher, rely on isAccepted
      if (data.version !== "2.0" && (!data.agreements || data.agreements.length === 0)) {
        return data.isAccepted === true;
      }
      
      // V2 strict validation
      if (!data.agreements || data.agreements.length !== EXACT_AGREEMENTS.length) return false;
      const unique = new Set(data.agreements);
      if (unique.size !== EXACT_AGREEMENTS.length) return false;
      for (const code of EXACT_AGREEMENTS) {
        if (!unique.has(code)) return false;
      }
      return true;
    }, {
      message: "Bạn phải đồng ý với tất cả các điều khoản cam kết hợp lệ",
      path: ["agreements"]
    }).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const { organizationLegalType, taxCode, legalRegistrationNumber, activityDescription, proofLinks } = data;

    if (LEGAL_TYPES_REQUIRING_REGISTRATION.includes(organizationLegalType)) {
      if (!taxCode && !legalRegistrationNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vui lòng cung cấp Mã số thuế hoặc Mã đăng ký/Quyết định thành lập",
          path: ["taxCode"],
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vui lòng cung cấp Mã số thuế hoặc Mã đăng ký/Quyết định thành lập",
          path: ["legalRegistrationNumber"],
        });
      }
    } else if (organizationLegalType === "COMMUNITY_GROUP") {
      if (!activityDescription || activityDescription.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vui lòng mô tả hoạt động của nhóm (ít nhất 10 ký tự)",
          path: ["activityDescription"],
        });
      }
      if (!proofLinks || proofLinks.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vui lòng cung cấp ít nhất 1 liên kết minh chứng",
          path: ["proofLinks"],
        });
      }
    } else if (organizationLegalType === "OTHER") {
      if (!activityDescription || activityDescription.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vui lòng mô tả rõ loại hình hoạt động (ít nhất 10 ký tự)",
          path: ["activityDescription"],
        });
      }
    }
  });

export const approveOrganizerRequestSchema = z
  .object({
    reviewReason: z
      .string()
      .min(5, "Lý do duyệt tối thiểu 5 ký tự")
      .max(1000, "Lý do duyệt tối đa 1000 ký tự"),
    checklist: z.object({
      manualIdentityReviewAcknowledged: z.literal(true, {
        errorMap: () => ({ message: "Bắt buộc xác nhận kiểm tra danh tính" }),
      }),
      commitmentReviewed: z.literal(true, {
        errorMap: () => ({ message: "Bắt buộc xác nhận kiểm tra cam kết" }),
      }),
      organizationInfoReviewed: z.literal(true, {
        errorMap: () => ({ message: "Bắt buộc xác nhận kiểm tra thông tin tổ chức" }),
      }),
      bankInfoReviewed: z.literal(true, {
        errorMap: () => ({ message: "Bắt buộc xác nhận kiểm tra ngân hàng" }),
      }),
      riskFlagsReviewed: z.literal(true, {
        errorMap: () => ({ message: "Bắt buộc xác nhận kiểm tra rủi ro" }),
      }),
    })
  })
  .strict();

export const declineOrganizerRequestSchema = z
  .object({
    reviewReason: z.string().min(5, "Lý do từ chối tối thiểu 5 ký tự").max(1000),
  })
  .strict();

export const verifyDepositSchema = z
  .object({
    amount: z
      .number({
        required_error: "Vui lòng nhập số tiền xác nhận",
        invalid_type_error: "Số tiền phải là một con số",
      })
      .int("Số tiền không hợp lệ")
      .positive("Số tiền phải lớn hơn 0")
      .min(1000, "Số tiền tối thiểu là 1000đ")
      .max(5000, "Số tiền tối đa là 5000đ"),
  })
  .strict();
