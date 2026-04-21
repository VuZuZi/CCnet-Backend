import Joi from "joi";

export const projectMilestoneParamsSchema = Joi.object({
  projectId: Joi.string().length(24).required(),
  milestoneId: Joi.string().trim().required(),
});

export const attendanceIdParamsSchema = Joi.object({
  attendanceId: Joi.string().length(24).required(),
});

export const reviewIdParamsSchema = Joi.object({
  reviewId: Joi.string().length(24).required(),
});

export const updateAttendanceSchema = Joi.object({
  status: Joi.string().valid("ATTENDED", "ABSENT").required(),
  note: Joi.string().allow("").max(500).default(""),
});

export const submitReviewSchema = Joi.object({
  score: Joi.number().min(1).max(5).required(),
  comment: Joi.string().allow("").max(1000).default(""),
});