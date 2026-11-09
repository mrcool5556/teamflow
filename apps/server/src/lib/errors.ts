/**
 * Typed HTTP errors. Throw one anywhere in a route or lib function and the app's onError
 * handler turns it into `{ error, code }` with the right status. The code list is documented
 * in docs/API.md ("Errors").
 */
export type ApiErrorCode =
  | "validation_error"
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "gone"
  | "payload_too_large"
  | "rate_limited"
  | "internal_error"
  | "service_unavailable"
  | "space_storage_full"
  | "server_storage_low"
  | "free_space_limit"
  | "setting_set_in_env";

export const ERROR_CODES: Record<number, ApiErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  413: "payload_too_large",
  429: "rate_limited",
  500: "internal_error",
  503: "service_unavailable",
};

export function codeForStatus(status: number): ApiErrorCode {
  return ERROR_CODES[status] ?? (status >= 500 ? "internal_error" : "bad_request");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Extra fields merged into the JSON body (for example the numbers behind a quota refusal). */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    message: string,
    code: ApiErrorCode = codeForStatus(status),
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): { error: string; code: ApiErrorCode } & Record<string, unknown> {
    return { ...this.details, error: this.message, code: this.code };
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export const badRequest = (message: string) => new ApiError(400, message, "bad_request");
export const validationError = (message: string) => new ApiError(400, message, "validation_error");
export const unauthorized = (message = "Unauthorized") =>
  new ApiError(401, message, "unauthorized");
export const forbidden = (message = "Permission denied") => new ApiError(403, message, "forbidden");
export const notFound = (message = "Not found") => new ApiError(404, message, "not_found");
export const conflict = (message: string) => new ApiError(409, message, "conflict");
export const gone = (message: string) => new ApiError(410, message, "gone");
export const payloadTooLarge = (message = "Request body too large") =>
  new ApiError(413, message, "payload_too_large");
export const rateLimited = (message = "Too many attempts. Try again later.") =>
  new ApiError(429, message, "rate_limited");
export const internalError = (message = "Internal Server Error") =>
  new ApiError(500, message, "internal_error");
export const serviceUnavailable = (message: string) =>
  new ApiError(503, message, "service_unavailable");
