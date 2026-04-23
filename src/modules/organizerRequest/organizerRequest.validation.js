import { z } from "zod";
import { ORGANIZATION_TYPE } from "./organizerRequest.constant.js";

const VN_PHONE_REGEX = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;
const BANK_ACCOUNT_REGEX = /^\d{8,19}$/;
const ACCOUNT_NAME_REGEX = /^[\p{L}\s.'-]{2,150}$/u;

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
    idCardFront: documentPayloadSchema,
    idCardBack: documentPayloadSchema,
    selfie: documentPayloadSchema,
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
  })
  .strict();

export const approveOrganizerRequestSchema = z
  .object({
    reviewReason: z
      .string()
      .min(5, "Lý do duyệt tối thiểu 5 ký tự")
      .max(1000, "Lý do duyệt tối đa 1000 ký tự"),
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