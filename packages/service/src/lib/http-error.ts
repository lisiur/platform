import { HTTPException } from "hono/http-exception";

type CauseRecord = Record<string, unknown>;

export type SerializedHTTPException = {
  code: number;
  message: string;
} & CauseRecord;

export function serializeHTTPException(
  err: HTTPException,
): SerializedHTTPException {
  const base: SerializedHTTPException = {
    code: err.status,
    message: err.message,
  };
  const cause = err.cause;
  if (cause && typeof cause === "object" && !Array.isArray(cause)) {
    return { ...base, ...(cause as CauseRecord) };
  }
  return base;
}

export function throwPermissionDenied(
  permission: string,
  reason: string,
): never {
  throw new HTTPException(403, {
    message: "Permission denied",
    cause: { permission, reason },
  });
}
