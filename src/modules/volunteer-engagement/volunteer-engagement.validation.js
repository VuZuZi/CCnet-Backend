import { z } from "zod";

export const projectMilestoneParamsSchema = z.object({
  projectId: z.string().length(24, "projectId không hợp lệ"),
  milestoneId: z.string().trim().min(1, "milestoneId là bắt buộc"),
});

export const attendanceIdParamsSchema = z.object({
  attendanceId: z.string().length(24, "attendanceId không hợp lệ"),
});

export const reviewIdParamsSchema = z.object({
  reviewId: z.string().length(24, "reviewId không hợp lệ"),
});

export const updateAttendanceSchema = z.object({
  status: z.enum(["ATTENDED", "ABSENT"]),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự").optional().default(""),
});

export const submitReviewSchema = z.object({
  score: z.coerce.number().min(1, "Điểm tối thiểu là 1").max(5, "Điểm tối đa là 5"),
  comment: z
    .string()
    .max(1000, "Nhận xét tối đa 1000 ký tự")
    .optional()
    .default(""),
});