export type CxErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'rate_limited'
  | 'payment_required'
  | 'unavailable'
  | 'network'
  | 'unknown';

/** Every failure the SDK reports, with a message fit to show a visitor. */
export class CxError extends Error {
  readonly code: CxErrorCode;
  readonly status: number;

  constructor(code: CxErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'CxError';
    this.code = code;
    this.status = status;
  }
}

export function codeForStatus(status: number): CxErrorCode {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 402:
      return 'payment_required';
    case 422:
      return 'invalid';
    case 429:
      return 'rate_limited';
    case 503:
      return 'unavailable';
    default:
      return 'unknown';
  }
}
