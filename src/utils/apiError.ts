// Consistent API error shape required by the spec:
// { "error": "message", "code": "MACHINE_CODE", "details": {} }
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(401, code, message, details);
  }

  static forbidden(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(403, code, message, details);
  }

  static notFound(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(404, code, message, details);
  }

  static conflict(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(409, code, message, details);
  }

  static tooManyRequests(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(429, code, message, details);
  }

  static internal(code: string, message: string, details: Record<string, unknown> = {}) {
    return new ApiError(500, code, message, details);
  }
}
