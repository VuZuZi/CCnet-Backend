import { z } from "zod";
import { ORGANIZATION_TYPE } from "./organizerRequest.constant.js";

const VN_PHONE_REGEX = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;
const BANK_ACCOUNT_REGEX = /^\d{8,19}$/;
const ACCOUNT_NAME_REGEX = /^[\p{L}\s.'-]{2,150}$/u;

const documentPayloadSchema = z
  .object({
    fileName: z.string().min(1, "Tên file là bắt buộc"),
    mimeType: z.string().min(1, "Loại file là bắt buộc"),
    size: z.coerce.number().min(0).optional(),
    url: z.string().url("URL file không hợp lệ").optional(),
    dataUrl: z.string().min(1, "dataUrl không được rỗng").optional(),
  })
  .strict()
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
    locationSnapshot: z.string().max(150).optional().default(""),

    organizationName: z.string().min(2).max(200),
    organizationType: z.enum(Object.values(ORGANIZATION_TYPE)),
    organizationWebsite: z
      .union([z.string().url("Website không hợp lệ"), z.literal("")])
      .optional()
      .default(""),

    idCardFront: documentPayloadSchema,
    idCardBack: documentPayloadSchema,
    businessLicense: z.preprocess(
  (v) => (v === null ? undefined : v),
  documentPayloadSchema.optional()
),
bankProof: z.preprocess(
  (v) => (v === null ? undefined : v),
  documentPayloadSchema.optional()
),

    bankName: z.string().min(2).max(200),
    bankAccountNumber: z
      .string()
      .regex(BANK_ACCOUNT_REGEX, "Số tài khoản phải từ 8 đến 19 chữ số"),
    bankAccountName: z
      .string()
      .regex(ACCOUNT_NAME_REGEX, "Tên chủ tài khoản không hợp lệ"),

    notes: z.string().max(1000).optional().default(""),
  })
  .strict();

export const declineOrganizerRequestSchema = z
  .object({
    reviewReason: z.string().min(5, "Lý do từ chối tối thiểu 5 ký tự").max(1000),
  })
  .strict();