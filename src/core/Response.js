import { StatusCodes, ReasonPhrases } from 'http-status-codes';

class ApiResponse {
  static success(res, data, message = 'Success') {
    return res.status(StatusCodes.OK).json({
      status: 'success',
      message,
      data
    });
  }
  static created(res, data, message = 'Resource created successfully') {
    return res.status(StatusCodes.CREATED).json({
      status: 'success',
      message,
      data
    });
  }
  static noContent(res) {
    return res.status(StatusCodes.NO_CONTENT).send();
  }
  static error(res, message = ReasonPhrases.INTERNAL_SERVER_ERROR, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, errors = null) {
    const response = {
      status: 'error',
      message
    };
    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }
}

export default ApiResponse;