import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(() => Readable.from([Buffer.from("file")])),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("#lib/db", () => ({
  prisma: {
    upload: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    systemConfig: { findUnique: vi.fn() },
  },
}));

import { unlink } from "node:fs/promises";
import { prisma } from "#lib/db";
import {
  deleteUploads,
  getFileAccess,
  listUploads,
  replaceUpload,
  uploadFile,
} from "./upload.service";

const mockPrisma = prisma as unknown as {
  upload: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  systemConfig: { findUnique: ReturnType<typeof vi.fn> };
};

const mockUnlink = unlink as unknown as ReturnType<typeof vi.fn>;

const publicUpload = {
  id: "upload1",
  path: "public/a/b/file.png",
  mimeType: "image/png",
  size: 4,
  visibility: "public",
  uploaderId: "user1",
  createdAt: new Date(),
};

const privateUpload = {
  ...publicUpload,
  visibility: "private",
};

describe("upload hotlink protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UPLOAD_SIGN_SECRET = "test-secret";
  });

  it("serves public file when no hotlink config exists", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);

    const result = await getFileAccess({
      id: "upload1",
      headers: new Headers({ referer: "https://evil.test/page" }),
    });

    expect(result.visibility).toBe("public");
  });

  it("serves public file when hotlink is disabled", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: false,
        allowedDomains: [],
        allowEmptyReferer: true,
      }),
    });

    const result = await getFileAccess({
      id: "upload1",
      headers: new Headers({ referer: "https://evil.test/page" }),
    });

    expect(result.visibility).toBe("public");
  });

  it("serves public file from an allowed referer", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        allowedDomains: ["example.com"],
        allowEmptyReferer: true,
      }),
    });

    const result = await getFileAccess({
      id: "upload1",
      headers: new Headers({ referer: "https://example.com/page" }),
    });

    expect(result.visibility).toBe("public");
  });

  it("rejects public file from a disallowed referer", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        allowedDomains: ["example.com"],
        allowEmptyReferer: true,
      }),
    });

    await expect(
      getFileAccess({
        id: "upload1",
        headers: new Headers({ referer: "https://evil.test/page" }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects public file from disallowed origin header", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        allowedDomains: ["example.com"],
        allowEmptyReferer: true,
      }),
    });

    await expect(
      getFileAccess({
        id: "upload1",
        headers: new Headers({ origin: "https://evil.test" }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("serves public file when referer is missing and empty referer is allowed", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        allowedDomains: ["example.com"],
        allowEmptyReferer: true,
      }),
    });

    const result = await getFileAccess({
      id: "upload1",
      headers: new Headers(),
    });

    expect(result.visibility).toBe("public");
  });

  it("rejects public file when referer is missing and empty referer is disallowed", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        allowedDomains: ["example.com"],
        allowEmptyReferer: false,
      }),
    });

    await expect(
      getFileAccess({
        id: "upload1",
        headers: new Headers(),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("fails open when hotlink config json is invalid", async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: "{not valid json",
    });

    const result = await getFileAccess({
      id: "upload1",
      headers: new Headers({ referer: "https://evil.test/page" }),
    });

    expect(result.visibility).toBe("public");
  });

  it("rejects private signed URL from disallowed referer", async () => {
    const expires = String(Date.now() + 60_000);
    const token = createHmac("sha256", "test-secret")
      .update(`upload1:${expires}`)
      .digest("hex");
    mockPrisma.upload.findUnique.mockResolvedValue(privateUpload);
    mockPrisma.systemConfig.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        allowedDomains: ["example.com"],
        allowEmptyReferer: true,
      }),
    });

    await expect(
      getFileAccess({
        id: "upload1",
        token,
        expires,
        headers: new Headers({ referer: "https://evil.test/page" }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

const mkFile = (name: string, type: string, data: Buffer): File =>
  new File([new Uint8Array(data)], name, { type });

describe("uploadFile validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UPLOAD_SIGN_SECRET = "test-secret";
  });

  it("rejects a disallowed mime type regardless of filename", async () => {
    await expect(
      uploadFile({
        file: mkFile("evil.html", "text/html", Buffer.from([0x3c, 0x68])),
        visibility: "public",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an html payload claiming image/jpeg (magic-byte mismatch)", async () => {
    await expect(
      uploadFile({
        file: mkFile(
          "evil.html",
          "image/jpeg",
          Buffer.from("<html><script>xss()</script>"),
        ),
        visibility: "public",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts a valid PNG and uses the canonical .png extension", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    (mockPrisma.upload.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "up1",
    });
    const result = await uploadFile({
      file: mkFile("photo.jpeg", "image/png", png),
      visibility: "public",
      uploaderId: "user1",
    });
    expect(result.id).toBe("up1");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.png$/);
    expect(createArgs.mimeType).toBe("image/png");
  });

  it("rejects a file exceeding the size limit", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    const oversized = mkFile("big.png", "image/png", png);
    Object.defineProperty(oversized, "size", { value: 6 * 1024 * 1024 });

    await expect(
      uploadFile({
        file: oversized,
        visibility: "public",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts a valid PDF and uses the .pdf extension", async () => {
    const pdf = Buffer.from("%PDF-1.4\nstuff");
    (mockPrisma.upload.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "up2",
    });
    const result = await uploadFile({
      file: mkFile("document.txt", "application/pdf", pdf),
      visibility: "private",
      uploaderId: "user1",
    });
    expect(result.id).toBe("up2");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.pdf$/);
    expect(createArgs.mimeType).toBe("application/pdf");
    expect(createArgs.visibility).toBe("private");
  });

  it("accepts a valid ICO favicon and uses the .ico extension", async () => {
    const ico = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    (mockPrisma.upload.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "up3",
    });
    const result = await uploadFile({
      file: mkFile("favicon.ico", "image/x-icon", ico),
      visibility: "public",
      uploaderId: "user1",
    });
    expect(result.id).toBe("up3");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.ico$/);
    expect(createArgs.mimeType).toBe("image/x-icon");
  });

  it("accepts a valid SVG favicon and uses the .svg extension", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    (mockPrisma.upload.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "up4",
    });
    const result = await uploadFile({
      file: mkFile("favicon.svg", "image/svg+xml", svg),
      visibility: "public",
      uploaderId: "user1",
    });
    expect(result.id).toBe("up4");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.svg$/);
    expect(createArgs.mimeType).toBe("image/svg+xml");
  });

  it("rejects an html payload claiming image/svg+xml (magic-byte mismatch)", async () => {
    await expect(
      uploadFile({
        file: mkFile(
          "evil.svg",
          "image/svg+xml",
          Buffer.from("<script>xss()</script>"),
        ),
        visibility: "public",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listUploads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns paginated uploads with total", async () => {
    const rows = [publicUpload];
    (mockPrisma.upload.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      rows,
    );
    (mockPrisma.upload.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await listUploads({ limit: 10, offset: 0 });

    expect(result.uploads).toEqual(rows);
    expect(result.total).toBe(1);
    expect(
      (mockPrisma.upload.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toMatchObject({ take: 10, skip: 0 });
  });

  it("applies visibility filter", async () => {
    (mockPrisma.upload.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );
    (mockPrisma.upload.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await listUploads({ visibility: "public" });

    const where = (mockPrisma.upload.count as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(where.visibility).toBe("public");
  });
});

describe("deleteUploads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("unlinks files on disk and deletes records", async () => {
    (mockPrisma.upload.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "a", path: "public/a/b/a.png" },
      { id: "b", path: "private/c/d/b.png" },
    ]);
    (
      mockPrisma.upload.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 2 });

    await deleteUploads(["a", "b"]);

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(
      (mockPrisma.upload.deleteMany as ReturnType<typeof vi.fn>).mock
        .calls[0][0].where.id.in,
    ).toEqual(["a", "b"]);
  });

  it("ignores missing files and still deletes records", async () => {
    (mockPrisma.upload.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "a", path: "public/a/b/a.png" },
    ]);
    mockUnlink.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    (
      mockPrisma.upload.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });

    await expect(deleteUploads(["a"])).resolves.toBeUndefined();
    expect(
      mockPrisma.upload.deleteMany as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalled();
  });
});

describe("replaceUpload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UPLOAD_SIGN_SECRET = "test-secret";
  });

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);

  it("updates path, mimeType and size and removes the old file", async () => {
    const existing = {
      id: "up1",
      path: "public/aa/bb/old.jpg",
      mimeType: "image/jpeg",
      size: 999,
      visibility: "public",
      uploaderId: "user1",
    };
    (
      mockPrisma.upload.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(existing);
    const updated = {
      ...existing,
      mimeType: "image/png",
      path: "public/x.png",
    };
    (mockPrisma.upload.update as ReturnType<typeof vi.fn>).mockResolvedValue(
      updated,
    );

    const result = await replaceUpload({
      id: "up1",
      file: mkFile("new.png", "image/png", png),
    });

    expect(result.mimeType).toBe("image/png");
    const updateArgs = (mockPrisma.upload.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(updateArgs.where.id).toBe("up1");
    expect(updateArgs.data.mimeType).toBe("image/png");
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("throws 404 when the upload does not exist", async () => {
    (
      mockPrisma.upload.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(
      replaceUpload({
        id: "missing",
        file: mkFile("new.png", "image/png", png),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
