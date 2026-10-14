import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeHTTPException } from "#lib/http-error";

vi.mock("#extractors/session", () => ({
  requirePrincipal: vi.fn(),
  getPrincipalUserId: vi.fn(),
}));

vi.mock("#lib/logger", () => ({ logAudit: vi.fn() }));

vi.mock("../../../transfer/import.service", () => ({
  previewImport: vi.fn(),
  previewToken: vi.fn((bytes: Uint8Array) => `hash-${bytes.byteLength}`),
}));

vi.mock("../../../transfer/zip", () => ({ readUpload: vi.fn() }));

import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { previewImport } from "../../../transfer/import.service";
import { readUpload } from "../../../transfer/zip";
import { previewImportRoute } from "../previewImport";

const mockRequirePrincipal = vi.mocked(requirePrincipal);
const mockGetPrincipalUserId = vi.mocked(getPrincipalUserId);
const mockPreviewImport = vi.mocked(previewImport);
const mockReadUpload = vi.mocked(readUpload);

/**
 * The multipart path is the risky part of this endpoint: zod-openapi has to
 * hand the handler a real `File` alongside the text fields, and the whole
 * import hinges on that. These go through a real `FormData` request rather
 * than a stubbed validator.
 */
async function postForm(fields: Record<string, string | File>) {
  const { OpenAPIHono } = await import("@hono/zod-openapi");
  const app = new OpenAPIHono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(serializeHTTPException(err), err.status);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });
  app.openapi(previewImportRoute.route, previewImportRoute.handler);

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return app.request("http://localhost/transfers/preview", {
    method: "POST",
    body: form,
  });
}

const plan = {
  source: "archive" as const,
  document: {
    formatVersion: 1,
    entries: [{ dayKey: "2026-08-20" }, { dayKey: "2026-08-22" }],
    accounts: [],
    projects: [],
    people: [],
    ledgerName: "旧账本",
    currency: "CNY",
  },
  accounts: [],
  projects: [],
  people: [],
  entries: { total: 2, importable: 2, duplicates: 0, invalid: 0 },
  photos: { count: 0, bytes: 0, missing: [] },
  issues: [],
  blocking: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePrincipal.mockResolvedValue({ kind: "user" } as never);
  mockGetPrincipalUserId.mockReturnValue("usr_me");
  mockPreviewImport.mockResolvedValue(plan as never);
  mockReadUpload.mockResolvedValue({
    kind: "archive",
    document: {},
    workbook: null,
    photos: new Map(),
  } as never);
});

describe("POST /transfers/preview", () => {
  it("reports the plan for an uploaded archive", async () => {
    const res = await postForm({ file: new File(["zip-bytes"], "b.zip") });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      source: "archive",
      ledger: {
        name: "旧账本",
        entries: 2,
        from: "2026-08-20",
        to: "2026-08-22",
      },
      target: { mode: "new", ledgerId: null },
      entries: { importable: 2 },
      previewToken: "hash-9",
    });
  });

  it("restores into a new ledger unless the form names one", async () => {
    await postForm({ file: new File(["zip"], "b.zip") });
    expect(mockPreviewImport).toHaveBeenCalledWith(
      "usr_me",
      expect.anything(),
      { mode: "new" },
    );

    mockPreviewImport.mockClear();
    await postForm({
      file: new File(["zip"], "b.zip"),
      target: "tgt_led",
    });
    expect(mockPreviewImport).toHaveBeenCalledWith(
      "usr_me",
      expect.anything(),
      { mode: "merge", ledgerId: "tgt_led" },
    );
  });

  it("names the ledger a restore creates", async () => {
    await postForm({
      file: new File(["zip"], "b.zip"),
      target: "new",
      ledgerName: "  恢复的账本  ",
    });
    expect(mockPreviewImport).toHaveBeenCalledWith(
      "usr_me",
      expect.anything(),
      { mode: "new", ledgerName: "恢复的账本" },
    );
  });

  it("hands the uploader's bytes and name to the reader", async () => {
    await postForm({ file: new File(["zip-bytes"], "ledger.zip") });
    const [bytes, name] = mockReadUpload.mock.calls[0];
    expect(Buffer.from(bytes).toString("utf8")).toBe("zip-bytes");
    expect(name).toBe("ledger.zip");
  });

  it("refuses a request with no file", async () => {
    const res = await postForm({ target: "new" });
    expect(res.status).toBe(400);
    expect(mockPreviewImport).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    const res = await postForm({
      file: new File([], "empty.zip", { type: "application/zip" }),
    });
    expect(res.status).toBe(400);
  });

  it("surfaces a read failure as the reader's own message", async () => {
    mockReadUpload.mockRejectedValue(
      new HTTPException(400, { message: "无法识别的文件格式（notes.txt）" }),
    );
    const res = await postForm({ file: new File(["x"], "notes.txt") });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      message: "无法识别的文件格式（notes.txt）",
    });
  });
});
