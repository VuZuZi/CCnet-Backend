import Joi from "joi";

const booleanField = Joi.boolean()
  .truthy("true")
  .truthy("1")
  .falsy("false")
  .falsy("0");

const objectIdField = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    "string.pattern.base": "postId must be a valid Mongo ObjectId",
  });

export const globalSearchSchema = Joi.object({
  q: Joi.string().allow("").trim().max(120).required(),
  limit: Joi.number().integer().min(1).max(20).default(8),
  offset: Joi.number().integer().min(0).default(0),
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
  recentOnly: booleanField.default(false),
  viewedOnly: booleanField.default(false),
  dateOrder: Joi.string().valid("newest", "oldest").default("newest"),
  location: Joi.string().allow("").trim().max(120).default(""),
  includeCounts: booleanField.default(true),
});

export const markCommunityPostViewedSchema = Joi.object({
  postId: objectIdField.required(),
});