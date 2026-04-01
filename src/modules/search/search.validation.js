import Joi from "joi";

export const globalSearchSchema = Joi.object({
  q: Joi.string().allow("").trim().max(120).required(),
  limit: Joi.number().integer().min(1).max(20).default(8),
  type: Joi.string()
    .valid(
      "all",
      "navbar",
      "organizer",
      "project",
      "needhelp",
      "communitypost",
      "user"
    )
    .default("all"),
  page: Joi.number().integer().min(1).default(1),
});