import { z } from "zod";

const pointLocationSchema = z
  .object({
    type: z.literal("Point"),
    coordinates: z.array(z.number()).length(2, "Location không hợp lệ"),
    address: z.string().trim().min(3, "Vui lòng chọn địa chỉ hợp lệ"),
  })
  .refine(
    (value) =>
      Array.isArray(value.coordinates) &&
      value.coordinates.length === 2 &&
      Number.isFinite(value.coordinates[0]) &&
      Number.isFinite(value.coordinates[1]),
    {
      message: "Location không hợp lệ",
      path: ["coordinates"],
    }
  );

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9\s\-]{7,15}$/, "Phone number is not valid")
      .or(z.literal(""))
      .optional(),
    location: z.preprocess(
      (value) => (value === null ? undefined : value),
      pointLocationSchema.optional()
    ),
    headline: z
      .string()
      .max(150, "Headline must be at most 150 characters")
      .or(z.literal(""))
      .optional(),
    about: z
      .string()
      .max(1000, "About section must be at most 1000 characters")
      .or(z.literal(""))
      .optional(),
    skills: z
      .array(z.string().max(50, "Each skill must be at most 50 characters"))
      .max(20, "Maximum 20 skills allowed")
      .optional(),
  }),
});

export const changePasswordSchema = z
  .object({
    body: z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z
        .string()
        .min(6, "New password must be at least 6 characters"),
    }),
  })
  .refine((data) => data.body.currentPassword !== data.body.newPassword, {
    message: "New password must be different from current password",
    path: ["body", "newPassword"],
  });