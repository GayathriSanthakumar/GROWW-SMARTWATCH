export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg = "Bad request") => new HttpError(400, msg, "BAD_REQUEST");
export const unauthorized = (msg = "Unauthorized") => new HttpError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Not found") => new HttpError(404, msg, "NOT_FOUND");
export const conflict = (msg = "Conflict") => new HttpError(409, msg, "CONFLICT");
