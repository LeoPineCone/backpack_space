/**
 * Fixed error codes (docs/client-server.md, "Error cases"). The app maps each code to a screen; the text for the
 * player comes from the app's language files, never from the server.
 */
export const ERROR_CODES = [
  /** the request does not match its schema (fields, types, size) */
  "bad_request",
  /** no route for this path and method */
  "not_found",
  /** missing, expired or forged session token: sign in again silently and repeat */
  "unauthorized",
  /** the identity from Game Center / Play Games (or the development identity) was not accepted */
  "identity_rejected",
  /** the server is in maintenance */
  "maintenance",
  /** the app (or its simulation version) is too old */
  "update_required",
  /** the run or round in the request does not fit the open run */
  "run_conflict",
  /** the backpack failed the plausibility check (logged as the event plausibility_rejected) */
  "invalid_backpack",
  /** the Credits balance at RevenueCat is too low */
  "insufficient_credits",
  /** too many requests: wait and repeat */
  "rate_limited",
  /** something broke on the server */
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** The HTTP status that goes with each code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  unauthorized: 401,
  identity_rejected: 401,
  maintenance: 503,
  update_required: 426,
  run_conflict: 409,
  invalid_backpack: 422,
  insufficient_credits: 402,
  rate_limited: 429,
  internal: 500,
};
