import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeHTTPException } from "#lib/http-error";

vi.mock("#extractors/session", () => ({
  requirePrincipal: vi.fn(),
  getPrincipalUserId: vi.fn(),
}));

vi.mock("#lib/logger", () => ({ logAudit: vi.fn() }));

vi.mock("../../../transfer/import.service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  commitImport: vi.fn(),
  previewToken: (bytes: Uint8Array) =>
    `hash-${Buffer.from(bytes).toString("utf8")}`,
}));

vi.mock("../../../transfer/zip", () => ({ readUpload: vi.fn() }));

import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import { commitImport } from "../../../transfer/import.service";
import { readUpload } from "../../../transfer/zip";
import { commitImportRoute } from "../commitImport";

const mockRequirePrincipal = vi.mocked(requirePrincipal);
const mockGetPrincipalUserId = vi.mocked(getPrincipalUserId);
const mockCommitImport = vi.mocked(commitImport);
const mockReadUpload = vi.mocked(readUpload);

async function postForm(fields: Record<string, string | File>) {
  const { OpenAPIHono } = await import("@hono/zod-openapi");
  const app = new OpenAPIHono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(serializeHTTPException(err), err.status);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });
  app.openapi(commitImportRoute.route, commitImportRoute.handler);

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return app.request("http://localhost/transfers/commit", {
    method: "POST",
    body: form,
  });
}

const result = {
  ledgerId: "new_led",
  mode: "new" as const,
  created: {
    accounts: 2,
    projects: 0,
    people: 1,
    entries: 12,
    photos: 3,
  },
  skipped: { entries: 0 },
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePrincipal.mockResolvedValue({ kind: "user" } as never);
  mockGetPrincipalUserId.mockReturnValue("usr_me");
  mockCommitImport.mockResolvedValue(result as never);
  mockReadUpload.mockResolvedValue({
    kind: "archive",
    document: {},
    workbook: null,
    photos: new Map(),
  } as never);
});

describe("POST /transfers/commit", () => {
  it("commits and audits what landed", async () => {
    const res = await postForm({ file: new File(["zip"], "b.zip") });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ledgerId: "new_led",
      created: { entries: 12 },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "qianlai_ledger.imported",
        after: expect.objectContaining({
          ledgerId: "new_led",
          mode: "new",
          entries: 12,
          photos: 3,
        }),
      }),
    );
  });

  it("accepts the preview's own token", async () => {
    const res = await postForm({
      file: new File(["zip-bytes"], "b.zip"),
      previewToken: "hash-zip-bytes",
    });
    expect(res.status).toBe(200);
    expect(mockCommitImport).toHaveBeenCalled();
  });

  it("refuses a file that isn't the one that was previewed", async () => {
    const res = await postForm({
      file: new File(["other"], "b.zip"),
      previewToken: "hash-zip-bytes",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      message: "文件与预览时不一致，请重新预览后再导入",
    });
    // The reader is never reached, so a swapped file can't even be parsed.
    expect(mockReadUpload).not.toHaveBeenCalled();
    expect(mockCommitImport).not.toHaveBeenCalled();
  });
});
