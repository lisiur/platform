import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "#generated/prisma/client";

const tx = { marker: "tx" } as unknown as Prisma.TransactionClient;

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  },
}));

vi.mock("#modules/attachment/attachment.service", () => ({
  USER_AVATAR_BIZ_TYPE: "user:avatar",
  createAttachment: vi.fn(),
  deleteAttachmentsByBiz: vi.fn(),
}));

vi.mock("../user-lookup.repository", () => ({
  userLookupRepository: {
    setAvatarById: vi.fn(),
  },
}));

import {
  createAttachment,
  deleteAttachmentsByBiz,
} from "#modules/attachment/attachment.service";
import { userLookupRepository } from "../user-lookup.repository";
import { replaceUserAvatar, uploadAvatar } from "../user.service";

const mockCreateAttachment = createAttachment as unknown as ReturnType<
  typeof vi.fn
>;
const mockDeleteAttachmentsByBiz =
  deleteAttachmentsByBiz as unknown as ReturnType<typeof vi.fn>;
const mockSetAvatarById = userLookupRepository.setAvatarById as unknown as ReturnType<
  typeof vi.fn
>;

const avatarFile = new File([new Uint8Array([1, 2, 3])], "a.jpg", {
  type: "image/jpeg",
});

describe("replaceUserAvatar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateAttachment.mockResolvedValue({
      attachmentId: "att-2",
      uploadId: "up-2",
      url: "/api/attachment/att-2",
    });
    mockSetAvatarById.mockResolvedValue({ id: "user-1" });
  });

  it("swaps the avatar inside the caller's transaction", async () => {
    const result = await replaceUserAvatar("user-1", avatarFile, "user-e", tx);

    // Old avatar goes first so a failed upload leaves the previous image
    // intact; the transaction only commits once the row is repointed.
    expect(mockDeleteAttachmentsByBiz).toHaveBeenCalledWith(
      "user:avatar",
      "user-1",
      tx,
    );
    expect(mockCreateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        file: avatarFile,
        visibility: "public",
        uploaderId: "user-e",
        bizType: "user:avatar",
        bizId: "user-1",
        tx,
      }),
    );
    expect(mockSetAvatarById).toHaveBeenCalledWith(
      "user-1",
      { avatar: "/api/attachment/att-2", avatarId: "att-2" },
      tx,
    );
    expect(result).toEqual({
      url: "/api/attachment/att-2",
      attachmentId: "att-2",
      user: { id: "user-1" },
    });
  });

  it("tolerates a first avatar (nothing to delete)", async () => {
    mockDeleteAttachmentsByBiz.mockResolvedValue(undefined);
    await replaceUserAvatar("user-1", avatarFile, "user-1", tx);
    expect(mockSetAvatarById).toHaveBeenCalledOnce();
  });
});

describe("uploadAvatar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateAttachment.mockResolvedValue({
      attachmentId: "att-2",
      uploadId: "up-2",
      url: "/api/attachment/att-2",
    });
    mockSetAvatarById.mockResolvedValue({ id: "user-1" });
  });

  it("runs the swap in a transaction, uploading as the owner themselves", async () => {
    const result = await uploadAvatar("user-1", avatarFile);
    expect(mockCreateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ uploaderId: "user-1", bizId: "user-1" }),
    );
    expect(result).toMatchObject({
      url: "/api/attachment/att-2",
      attachmentId: "att-2",
    });
  });
});
