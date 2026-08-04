import { describe, expect, it } from "vitest";
import { shouldSkipOperationLog } from "#middleware/operation-logger";

describe("shouldSkipOperationLog", () => {
  it("skips GET /api/operation-logs", () => {
    expect(shouldSkipOperationLog("GET", "/api/operation-logs")).toBe(true);
  });

  it("skips GET /api/operation-logs with an id segment", () => {
    expect(shouldSkipOperationLog("GET", "/api/operation-logs/abc123")).toBe(
      true,
    );
  });

  it("skips GET /api/audit-logs", () => {
    expect(shouldSkipOperationLog("GET", "/api/audit-logs")).toBe(true);
  });

  it("skips GET /api/audit-logs with an id segment", () => {
    expect(shouldSkipOperationLog("GET", "/api/audit-logs/abc123")).toBe(true);
  });

  it("does not skip the legacy /api/log path", () => {
    expect(shouldSkipOperationLog("GET", "/api/log")).toBe(false);
    expect(shouldSkipOperationLog("GET", "/api/log/abc123")).toBe(false);
  });

  it("does not skip unrelated GET endpoints", () => {
    expect(shouldSkipOperationLog("GET", "/api/users")).toBe(false);
    expect(shouldSkipOperationLog("GET", "/api/operation-logs-export")).toBe(
      false,
    );
  });

  it("does not skip non-GET methods on the log endpoints", () => {
    expect(shouldSkipOperationLog("POST", "/api/operation-logs")).toBe(false);
    expect(shouldSkipOperationLog("DELETE", "/api/audit-logs/abc123")).toBe(
      false,
    );
  });

  it("does not skip paths outside /api", () => {
    expect(shouldSkipOperationLog("GET", "/operation-logs")).toBe(false);
  });
});
