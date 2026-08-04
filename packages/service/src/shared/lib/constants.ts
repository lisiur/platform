// Maximum logical size of a single uploaded file, enforced by the upload
// service before the file is written to disk.
export const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Maximum multipart request body size, enforced at the transport layer by the
// Hono bodyLimit middleware. Derived from the file cap to leave headroom for
// multipart framing (boundaries + form fields such as `visibility`).
export const MAX_UPLOAD_BODY_SIZE = MAX_UPLOAD_FILE_SIZE + 1024 * 1024; // 5MB + 1MB headroom

// Maximum request body size for non-multipart (JSON) endpoints, enforced
// globally by the Hono bodyLimit middleware.
export const MAX_JSON_BODY_SIZE = 2 * 1024 * 1024; // 2MB

// How long a signed upload access URL stays valid.
export const UPLOAD_SIGN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Default max requests per window for the global rate limiter.
// Overridable via the RATE_LIMIT_GLOBAL_MAX env var.
export const RATE_LIMIT_GLOBAL_DEFAULT_MAX = 300;

// Default window length for the global rate limiter.
// Overridable via the RATE_LIMIT_GLOBAL_WINDOW_MS env var.
export const RATE_LIMIT_GLOBAL_DEFAULT_WINDOW_MS = 60_000; // 60s

// Default max requests per window for the auth (sign-in / sign-up) rate limiter.
// Overridable via the RATE_LIMIT_AUTH_MAX env var.
export const RATE_LIMIT_AUTH_DEFAULT_MAX = 10;

// Default window length for the auth rate limiter.
// Overridable via the RATE_LIMIT_AUTH_WINDOW_MS env var.
export const RATE_LIMIT_AUTH_DEFAULT_WINDOW_MS = 60_000; // 60s
