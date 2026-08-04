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
      delete: vi.fn(),
    },
    attachment: {
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
  createAttachment,
  deleteAttachments,
  getFileAccess,
  listAttachments,
  replaceAttachment,
} from "./attachment.service";

const mockPrisma = prisma as unknown as {
  upload: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  attachment: {
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
  hash: "abc123",
  createdAt: new Date(),
};

const publicAttachment = {
  id: "attachment1",
  bizType: "user:avatar",
  bizId: "user1",
  uploadId: "upload1",
  visibility: "public",
  createdBy: "user1",
  createdAt: new Date(),
  upload: publicUpload,
};

const privateAttachment = {
  ...publicAttachment,
  visibility: "private",
};

describe("getFileAccess hotlink protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UPLOAD_SIGN_SECRET = "test-secret";
  });

  it("serves public file when no hotlink config exists", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(publicAttachment);
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);

    const result = await getFileAccess({
      id: "attachment1",
    });

    expect(result.visibility).toBe("public");
  });

  it("rejects private file without token", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(privateAttachment);
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);

    await expect(getFileAccess({ id: "attachment1" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects expired token", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(privateAttachment);
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
    const expires = String(Date.now() - 1000);
    const token = createHmac("sha256", "test-secret")
      .update(`attachment1:${expires}`)
      .digest("hex");

    await expect(
      getFileAccess({
        id: "attachment1",
        token,
        expires,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects tampered token", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(privateAttachment);
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
    const expires = String(Date.now() + 60000);
    const token = createHmac("sha256", "wrong-secret")
      .update(`attachment1:${expires}`)
      .digest("hex");

    await expect(
      getFileAccess({
        id: "attachment1",
        token,
        expires,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("accepts valid token for private file", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(privateAttachment);
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
    const expires = String(Date.now() + 60000);
    const token = createHmac("sha256", "test-secret")
      .update(`attachment1:${expires}`)
      .digest("hex");

    const result = await getFileAccess({
      id: "attachment1",
      token,
      expires,
    });

    expect(result.visibility).toBe("private");
  });
});

describe("createAttachment validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UPLOAD_SIGN_SECRET = "test-secret";
  });

  it("rejects a disallowed mime type regardless of filename", async () => {
    await expect(
      createAttachment({
        file: new File([new Uint8Array([0x3c, 0x68])], "evil.html", {
          type: "text/html",
        }),
        visibility: "public",
        bizType: "user:avatar",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an html payload claiming image/jpeg (magic-byte mismatch)", async () => {
    await expect(
      createAttachment({
        file: new File(
          [new Uint8Array(Buffer.from("<html><script>xss()</script>"))],
          "evil.html",
          { type: "image/jpeg" },
        ),
        visibility: "public",
        bizType: "user:avatar",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts a valid PNG and uses the canonical .png extension", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    mockPrisma.upload.findUnique.mockResolvedValue(null);
    mockPrisma.upload.create.mockResolvedValue({
      id: "up1",
    });
    mockPrisma.attachment.create.mockResolvedValue({
      id: "att1",
    });
    const result = await createAttachment({
      file: new File([new Uint8Array(png)], "photo.jpeg", {
        type: "image/png",
      }),
      visibility: "public",
      bizType: "user:avatar",
      uploaderId: "user1",
    });
    expect(result.uploadId).toBe("up1");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.png$/);
    expect(createArgs.mimeType).toBe("image/png");
  });

  it("rejects a file exceeding the size limit", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    const oversized = new File([new Uint8Array(png)], "big.png", {
      type: "image/png",
    });
    Object.defineProperty(oversized, "size", { value: 6 * 1024 * 1024 });

    await expect(
      createAttachment({
        file: oversized,
        visibility: "public",
        bizType: "user:avatar",
        uploaderId: "user1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts a valid PDF and uses the .pdf extension", async () => {
    const pdf = Buffer.from("%PDF-1.4\nstuff");
    mockPrisma.upload.findUnique.mockResolvedValue(null);
    mockPrisma.upload.create.mockResolvedValue({
      id: "up2",
    });
    mockPrisma.attachment.create.mockResolvedValue({
      id: "att2",
    });
    const result = await createAttachment({
      file: new File([new Uint8Array(pdf)], "document.txt", {
        type: "application/pdf",
      }),
      visibility: "private",
      bizType: "user:avatar",
      uploaderId: "user1",
    });
    expect(result.uploadId).toBe("up2");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.pdf$/);
    expect(createArgs.mimeType).toBe("application/pdf");
  });

  it("accepts a valid ICO favicon and uses the .ico extension", async () => {
    const ico = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    mockPrisma.upload.findUnique.mockResolvedValue(null);
    mockPrisma.upload.create.mockResolvedValue({
      id: "up3",
    });
    mockPrisma.attachment.create.mockResolvedValue({
      id: "att3",
    });
    const result = await createAttachment({
      file: new File([new Uint8Array(ico)], "favicon.ico", {
        type: "image/x-icon",
      }),
      visibility: "public",
      bizType: "user:avatar",
      uploaderId: "user1",
    });
    expect(result.uploadId).toBe("up3");
    const createArgs = (mockPrisma.upload.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].data;
    expect(createArgs.path).toMatch(/\.ico$/);
    expect(createArgs.mimeType).toBe("image/x-icon");
  });

  it("returns existing upload if hash matches", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    mockPrisma.upload.findUnique.mockResolvedValue(publicUpload);
    mockPrisma.attachment.create.mockResolvedValue({
      id: "att4",
    });
    const result = await createAttachment({
      file: new File([new Uint8Array(png)], "photo.jpeg", {
        type: "image/png",
      }),
      visibility: "public",
      bizType: "user:avatar",
      uploaderId: "user1",
    });
    expect(mockPrisma.upload.create).not.toHaveBeenCalled();
    expect(result.uploadId).toBe("upload1");
  });

  it("returns paginated attachments with total", async () => {
    const rows = [
      {
        id: "att1",
        bizType: "user:avatar",
        bizId: "user1",
        uploadId: "upload1",
        visibility: "public",
        createdBy: "user1",
        createdAt: new Date(),
        upload: publicUpload,
      },
    ];
    (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue(rows);
    (mockPrisma.attachment.count as ReturnType<typeof vi.fn>).mockResolvedValue(
      1,
    );

    const result = await listAttachments({ limit: 10, offset: 0 });

    expect(result.attachments).toEqual(rows);
    expect(result.total).toBe(1);
  });

  it("filters attachments by visibility", async () => {
    (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (mockPrisma.attachment.count as ReturnType<typeof vi.fn>).mockResolvedValue(
      0,
    );

    await listAttachments({ visibility: "private" });

    const where = (mockPrisma.attachment.count as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(where.visibility).toBe("private");
  });

  it("deletes attachment and orphan upload", async () => {
    const attachmentWithUpload = {
      ...publicAttachment,
      upload: publicUpload,
    };
    (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([attachmentWithUpload]);
    mockUnlink.mockResolvedValue(undefined);
    (
      mockPrisma.attachment.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });
    (mockPrisma.attachment.count as ReturnType<typeof vi.fn>).mockResolvedValue(
      0,
    );

    await deleteAttachments(["attachment1"], {
      userId: "user1",
      canManageAll: true,
    });

    expect(mockPrisma.attachment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["attachment1"] } },
    });
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("does not delete upload if other attachments reference it", async () => {
    const attachmentWithUpload = {
      ...publicAttachment,
      upload: publicUpload,
    };
    (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([attachmentWithUpload]);
    (
      mockPrisma.attachment.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });
    (mockPrisma.attachment.count as ReturnType<typeof vi.fn>).mockResolvedValue(
      1,
    );

    await deleteAttachments(["attachment1"], {
      userId: "user1",
      canManageAll: true,
    });

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockPrisma.upload.delete).not.toHaveBeenCalled();
  });

  it("replaces attachment upload when hash changes", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    mockPrisma.attachment.findUnique.mockResolvedValue(publicAttachment);
    mockPrisma.upload.findUnique.mockResolvedValue(null);
    mockPrisma.upload.create.mockResolvedValue({ id: "newUpload" });
    mockPrisma.attachment.count.mockResolvedValue(1);

    const result = await replaceAttachment({
      id: "attachment1",
      file: new File([new Uint8Array(png)], "new.png", { type: "image/png" }),
      actor: { userId: "user1", canManageAll: true },
    });

    expect(result.uploadId).toBe("newUpload");
  });

  it("throws 404 when the attachment does not exist", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(null);

    await expect(
      replaceAttachment({
        id: "nonexistent",
        file: new File([new Uint8Array([0x00])], "test.png", {
          type: "image/png",
        }),
        actor: { userId: "user1", canManageAll: true },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];

describe("attachment ownership scoping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UPLOAD_SIGN_SECRET = "test-secret";
  });

  it("rejects replace by a non-owner without manage-all", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      ...publicAttachment,
      createdBy: "owner-user",
    });

    await expect(
      replaceAttachment({
        id: "attachment1",
        file: new File([new Uint8Array(PNG_BYTES)], "new.png", {
          type: "image/png",
        }),
        actor: { userId: "other-user", canManageAll: false },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows replace by the owner", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      ...publicAttachment,
      createdBy: "user1",
    });
    mockPrisma.upload.create.mockResolvedValue({ id: "newUpload" });
    mockPrisma.attachment.count.mockResolvedValue(1);

    const result = await replaceAttachment({
      id: "attachment1",
      file: new File([new Uint8Array(PNG_BYTES)], "new.png", {
        type: "image/png",
      }),
      actor: { userId: "user1", canManageAll: false },
    });

    expect(result.uploadId).toBe("newUpload");
  });

  it("allows replace on others' files with manage-all", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      ...publicAttachment,
      createdBy: "owner-user",
    });
    mockPrisma.upload.create.mockResolvedValue({ id: "newUpload" });
    mockPrisma.attachment.count.mockResolvedValue(1);

    const result = await replaceAttachment({
      id: "attachment1",
      file: new File([new Uint8Array(PNG_BYTES)], "new.png", {
        type: "image/png",
      }),
      actor: { userId: "admin", canManageAll: true },
    });

    expect(result.uploadId).toBe("newUpload");
  });

  it("scopes deleteAttachments to caller's own files without manage-all", async () => {
    const ownedAttachment = { ...publicAttachment, id: "owned" };
    (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([ownedAttachment]);
    (
      mockPrisma.attachment.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });

    await deleteAttachments(["owned", "someone-elses"], {
      userId: "user1",
      canManageAll: false,
    });

    const findWhere = (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0][0].where;
    expect(findWhere.createdBy).toBe("user1");
    expect(findWhere.id.in).toEqual(["owned", "someone-elses"]);

    const deleteWhere = (
      mockPrisma.attachment.deleteMany as ReturnType<typeof vi.fn>
    ).mock.calls[0][0].where;
    expect(deleteWhere.createdBy).toBe("user1");
    expect(deleteWhere.id.in).toEqual(["owned"]);
  });

  it("deleteAttachments ignores ownership with manage-all", async () => {
    (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { ...publicAttachment, id: "a" },
      { ...publicAttachment, id: "b" },
    ]);
    (
      mockPrisma.attachment.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 2 });

    await deleteAttachments(["a", "b"], {
      userId: "admin",
      canManageAll: true,
    });

    const findWhere = (
      mockPrisma.attachment.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0][0].where;
    expect(findWhere.createdBy).toBeUndefined();
    const deleteWhere = (
      mockPrisma.attachment.deleteMany as ReturnType<typeof vi.fn>
    ).mock.calls[0][0].where;
    expect(deleteWhere.createdBy).toBeUndefined();
    expect(deleteWhere.id.in).toEqual(["a", "b"]);
  });
});
