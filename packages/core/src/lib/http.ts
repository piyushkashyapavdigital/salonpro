import type { NextFunction, Request, Response } from './router';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'You must sign in to continue.') =>
  new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do that.') =>
  new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, 'not_found', msg);
export const conflict = (msg: string, details?: unknown) =>
  new HttpError(409, 'conflict', msg, details);
export const tooMany = (msg = 'Too many requests. Please slow down.') =>
  new HttpError(429, 'rate_limited', msg);

type Handler = (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>;

/** Wrap an async handler so rejected promises reach the error middleware. */
export function handler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
