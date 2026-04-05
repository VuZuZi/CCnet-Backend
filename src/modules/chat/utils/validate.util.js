export function validateRequest(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const message =
      error.details?.map((item) => item.message).join(', ') ||
      'Validation failed';

    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  }

  return value;
}

export default validateRequest;