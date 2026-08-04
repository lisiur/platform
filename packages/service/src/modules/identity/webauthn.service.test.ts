import type {
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateRegistrationOptions = vi.fn();
const mockVerifyRegistrationResponse = vi.fn();
const mockGenerateAuthenticationOptions = vi.fn();
const mockVerifyAuthenticationResponse = vi.fn();

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: (...args: unknown[]) =>
    mockGenerateRegistrationOptions(...args),
  verifyRegistrationResponse: (...args: unknown[]) =>
    mockVerifyRegistrationResponse(...args),
  generateAuthenticationOptions: (...args: unknown[]) =>
    mockGenerateAuthenticationOptions(...args),
  verifyAuthenticationResponse: (...args: unknown[]) =>
    mockVerifyAuthenticationResponse(...args),
}));

vi.mock("#lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    member: { findMany: vi.fn() },
  },
}));

vi.mock("#lib/logger", () => ({ logAudit: vi.fn() }));
vi.mock("#lib/session", () => ({ createSession: vi.fn() }));

vi.mock("#modules/system/system-config.repository", () => ({
  systemConfigRepository: { findByGroup: vi.fn() },
}));

vi.mock("#modules/identity/auth.service", () => ({
  assertNotBanned: vi.fn(),
  getDefaultActiveOrganizationId: vi.fn().mockResolvedValue(null),
}));

const cacheStore = new Map<string, unknown>();
vi.mock("#states/cache", () => ({
  webauthnChallengeCache: {
    set: vi.fn((k: string, v: unknown) => {
      cacheStore.set(k, v);
    }),
    get: vi.fn(
      <T>(k: string): T | undefined => cacheStore.get(k) as T | undefined,
    ),
    delete: vi.fn((k: string) => {
      cacheStore.delete(k);
    }),
  },
}));

import { prisma } from "#lib/db";
import { createSession } from "#lib/session";
import { assertNotBanned } from "#modules/identity/auth.service";
import { systemConfigRepository } from "#modules/system/system-config.repository";
import {
  assertWebAuthnEnabled,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  getWebAuthnEnabled,
  removeWebAuthnCredential,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn.service";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  account: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};
const mockConfigRepo = systemConfigRepository as unknown as {
  findByGroup: ReturnType<typeof vi.fn>;
};
const mockCreateSession = createSession as unknown as ReturnType<typeof vi.fn>;
const mockAssertNotBanned = assertNotBanned as unknown as ReturnType<
  typeof vi.fn
>;

const baseUser = {
  id: "user_1",
  name: "Jane",
  email: "jane@example.com",
  emailVerified: true,
  avatar: null,
  banned: false,
  banReason: null,
  banExpires: null,
  flags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function encodeBase64(text: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text).toString("base64url");
  }
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_");
}

function buildClientDataJSON(challenge: string): string {
  return encodeBase64(
    JSON.stringify({ challenge, origin: "http://localhost" }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  cacheStore.clear();
  mockConfigRepo.findByGroup.mockImplementation((group: string) => {
    if (group !== "webauthn") return Promise.resolve([]);
    return Promise.resolve([
      { group: "webauthn", key: "rp.name", value: "Test RP" },
      { group: "webauthn", key: "rp.id", value: "localhost" },
      { group: "webauthn", key: "origin", value: "http://localhost:3000" },
    ]);
  });
});

async function expectStatus(fn: () => Promise<unknown>, status: number) {
  const err = await fn().catch((e) => e);
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("getWebAuthnEnabled / assertWebAuthnEnabled", () => {
  it("returns false when the config is missing (default-off)", async () => {
    mockConfigRepo.findByGroup.mockResolvedValue([]);
    expect(await getWebAuthnEnabled()).toBe(false);
  });

  it("returns false when the config is explicitly 'false'", async () => {
    mockConfigRepo.findByGroup.mockResolvedValue([
      { group: "webauthn", key: "enabled", value: "false" },
    ]);
    expect(await getWebAuthnEnabled()).toBe(false);
  });

  it("returns true when the config is 'true'", async () => {
    mockConfigRepo.findByGroup.mockResolvedValue([
      { group: "webauthn", key: "enabled", value: "true" },
    ]);
    expect(await getWebAuthnEnabled()).toBe(true);
  });

  it("throws 403 when disabled", async () => {
    mockConfigRepo.findByGroup.mockResolvedValue([
      { group: "webauthn", key: "enabled", value: "false" },
    ]);
    await expectStatus(() => assertWebAuthnEnabled(), 403);
  });
});

describe("generateRegistrationOptions", () => {
  it("stores the challenge and returns options with a timeout", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, accounts: [] });
    mockGenerateRegistrationOptions.mockResolvedValue({
      challenge: "reg-challenge",
      rp: { name: "Test RP", id: "localhost" },
      user: { id: "user_1", name: "jane@example.com", displayName: "Jane" },
      pubKeyCredParams: [],
    });

    const options = await generateRegistrationOptions("user_1");

    expect(options.timeout).toBe(5 * 60 * 1000);
    expect(options.challenge).toBe("reg-challenge");
    expect(cacheStore.get("register:reg-challenge")).toMatchObject({
      userId: "user_1",
      challenge: "reg-challenge",
    });
    expect(
      (cacheStore.get("register:reg-challenge") as { expiresAt: number })
        .expiresAt,
    ).toBeGreaterThan(Date.now());
  });

  it("excludes existing credential IDs from the new challenge", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      accounts: [
        {
          id: "acct_old",
          providerId: "webauthn",
          providerData: {
            credentialId: "existing-cred",
            publicKey: "pk",
            counter: 0,
          },
        },
      ],
    });
    mockGenerateRegistrationOptions.mockResolvedValue({ challenge: "c1" });

    await generateRegistrationOptions("user_1");

    const call = mockGenerateRegistrationOptions.mock.calls[0][0] as {
      excludeCredentials: Array<{ id: string }>;
    };
    expect(call.excludeCredentials).toEqual([
      { id: "existing-cred", type: "public-key" },
    ]);
  });

  it("throws 404 when the user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expectStatus(() => generateRegistrationOptions("missing"), 404);
  });
});

describe("verifyRegistration", () => {
  const registrationResponse = {
    id: "cred-1",
    rawId: "cred-1-raw",
    type: "public-key" as const,
    response: {
      attestationObject: "att",
      clientDataJSON: buildClientDataJSON("reg-challenge"),
      transports: ["internal"],
    },
    authenticatorAttachment: "platform" as const,
    clientExtensionResults: {},
  } as unknown as RegistrationResponseJSON;

  it("rejects an unknown challenge", async () => {
    await expectStatus(
      () =>
        verifyRegistration({
          userId: "user_1",
          credential: registrationResponse,
        }),
      400,
    );
  });

  it("rejects an expired challenge and deletes it", async () => {
    cacheStore.set("register:reg-challenge", {
      userId: "user_1",
      challenge: "reg-challenge",
      expiresAt: Date.now() - 1_000,
    });

    await expectStatus(
      () =>
        verifyRegistration({
          userId: "user_1",
          credential: registrationResponse,
        }),
      400,
    );
    expect(cacheStore.has("register:reg-challenge")).toBe(false);
  });

  it("rejects when the challenge user does not match", async () => {
    cacheStore.set("register:reg-challenge", {
      userId: "other_user",
      challenge: "reg-challenge",
      expiresAt: Date.now() + 60_000,
    });

    await expectStatus(
      () =>
        verifyRegistration({
          userId: "user_1",
          credential: registrationResponse,
        }),
      400,
    );
  });

  it("consumes the challenge (single-use) on a successful verify", async () => {
    cacheStore.set("register:reg-challenge", {
      userId: "user_1",
      challenge: "reg-challenge",
      expiresAt: Date.now() + 60_000,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
    mockVerifyRegistrationResponse.mockResolvedValue({
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as VerifiedRegistrationResponse);
    mockPrisma.account.create.mockResolvedValue({
      id: "acct_1",
      createdAt: new Date(),
    });

    await verifyRegistration({
      userId: "user_1",
      credential: registrationResponse,
    });

    expect(cacheStore.has("register:reg-challenge")).toBe(false);
  });

  it("creates an account and does NOT create a session", async () => {
    cacheStore.set("register:reg-challenge", {
      userId: "user_1",
      challenge: "reg-challenge",
      expiresAt: Date.now() + 60_000,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
    mockVerifyRegistrationResponse.mockResolvedValue({
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as VerifiedRegistrationResponse);
    mockPrisma.account.create.mockResolvedValue({
      id: "acct_1",
      createdAt: new Date(),
    });

    const result = await verifyRegistration({
      userId: "user_1",
      credential: registrationResponse,
      deviceName: "My Laptop",
    });

    expect(mockPrisma.account.create).toHaveBeenCalledTimes(1);
    const created = mockPrisma.account.create.mock.calls[0][0] as {
      data: { providerData: { deviceName: string; credentialId: string } };
    };
    expect(created.data.providerData.deviceName).toBe("My Laptop");
    expect(created.data.providerData.credentialId).toBe("cred-1");
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      credentialId: "cred-1",
      deviceName: "My Laptop",
    });
  });

  it("uses a derived device name when none is supplied", async () => {
    cacheStore.set("register:reg-challenge", {
      userId: "user_1",
      challenge: "reg-challenge",
      expiresAt: Date.now() + 60_000,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
    mockVerifyRegistrationResponse.mockResolvedValue({
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as VerifiedRegistrationResponse);
    mockPrisma.account.create.mockResolvedValue({
      id: "acct_1",
      createdAt: new Date(),
    });

    const result = await verifyRegistration({
      userId: "user_1",
      credential: registrationResponse,
    });

    expect(result.deviceName).toBe("This Device");
  });

  it("returns 400 when verification throws", async () => {
    cacheStore.set("register:reg-challenge", {
      userId: "user_1",
      challenge: "reg-challenge",
      expiresAt: Date.now() + 60_000,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
    mockVerifyRegistrationResponse.mockRejectedValue(new Error("bad sig"));

    await expectStatus(
      () =>
        verifyRegistration({
          userId: "user_1",
          credential: registrationResponse,
        }),
      400,
    );
  });

  it("decodes base64url clientDataJSON containing URL-safe characters", async () => {
    // A challenge whose base64url-encoded clientDataJSON contains '-'/'_'.
    const challenge = "challenge~with~tilde123";
    const response = {
      ...registrationResponse,
      response: {
        ...registrationResponse.response,
        clientDataJSON: buildClientDataJSON(challenge),
      },
    } as unknown as RegistrationResponseJSON;

    cacheStore.set(`register:${challenge}`, {
      userId: "user_1",
      challenge,
      expiresAt: Date.now() + 60_000,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
    mockVerifyRegistrationResponse.mockResolvedValue({
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as VerifiedRegistrationResponse);
    mockPrisma.account.create.mockResolvedValue({
      id: "acct_1",
      createdAt: new Date(),
    });

    const result = await verifyRegistration({
      userId: "user_1",
      credential: response,
    });
    expect(result.credentialId).toBe("cred-1");
  });

  it("returns 400 when clientDataJSON is not valid JSON", async () => {
    const response = {
      ...registrationResponse,
      response: {
        ...registrationResponse.response,
        clientDataJSON: encodeBase64("definitely not json"),
      },
    } as unknown as RegistrationResponseJSON;

    await expectStatus(
      () => verifyRegistration({ userId: "user_1", credential: response }),
      400,
    );
  });
});

describe("generateAuthenticationOptions — user-enumeration mitigation", () => {
  it("returns a challenge for an unknown user without storing it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: "c" });

    const options = await generateAuthenticationOptions("nobody@example.com");

    expect(options.challenge).toBe("c");
    expect(cacheStore.has("auth:c")).toBe(false);
  });

  it("returns a challenge for a known user without credentials without storing it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, accounts: [] });
    mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: "c" });

    await generateAuthenticationOptions("jane@example.com");

    expect(cacheStore.has("auth:c")).toBe(false);
  });

  it("stores the challenge only when the user has WebAuthn credentials", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      accounts: [
        {
          id: "acct_w",
          providerId: "webauthn",
          providerData: {
            credentialId: "cred-1",
            publicKey: "pk",
            counter: 0,
          },
        },
      ],
    });
    mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: "c" });

    await generateAuthenticationOptions("jane@example.com");

    expect(cacheStore.has("auth:c")).toBe(true);
  });
});

describe("verifyAuthentication", () => {
  const authResponse = {
    id: "cred-1",
    rawId: "cred-1-raw",
    type: "public-key" as const,
    response: {
      authenticatorData: "ad",
      clientDataJSON: buildClientDataJSON("auth-challenge"),
      signature: "sig",
    },
    clientExtensionResults: {},
  } as unknown as AuthenticationResponseJSON;

  function seedAuthChallenge(userId = "user_1") {
    cacheStore.set("auth:auth-challenge", {
      userId,
      challenge: "auth-challenge",
      expiresAt: Date.now() + 60_000,
    });
  }

  it("returns a single 400 error for an unknown challenge", async () => {
    await expectStatus(
      () =>
        verifyAuthentication({
          email: "jane@example.com",
          credential: authResponse,
        }),
      400,
    );
  });

  it("returns 400 when the user does not exist", async () => {
    seedAuthChallenge();
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expectStatus(
      () =>
        verifyAuthentication({
          email: "jane@example.com",
          credential: authResponse,
        }),
      400,
    );
  });

  it("returns 400 when the challenge user does not match", async () => {
    seedAuthChallenge("other_user");
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, accounts: [] });

    await expectStatus(
      () =>
        verifyAuthentication({
          email: "jane@example.com",
          credential: authResponse,
        }),
      400,
    );
  });

  it("returns 400 when no matching credential exists", async () => {
    seedAuthChallenge();
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      accounts: [
        {
          id: "acct_w",
          providerId: "webauthn",
          providerData: {
            credentialId: "some-other-cred",
            publicKey: "pk",
            counter: 0,
          },
        },
      ],
    });

    await expectStatus(
      () =>
        verifyAuthentication({
          email: "jane@example.com",
          credential: authResponse,
        }),
      400,
    );
  });

  it("updates the counter and creates a session on success", async () => {
    seedAuthChallenge();
    const account = {
      id: "acct_w",
      providerId: "webauthn",
      providerData: {
        credentialId: "cred-1",
        publicKey: encodeBase64("public-key-bytes"),
        counter: 0,
      },
    };
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      accounts: [account],
    });
    mockVerifyAuthenticationResponse.mockResolvedValue({
      authenticationInfo: { newCounter: 7 },
    } as VerifiedAuthenticationResponse);
    mockCreateSession.mockResolvedValue({ id: "sess_1", token: "tok_1" });

    const result = await verifyAuthentication({
      email: "jane@example.com",
      credential: authResponse,
    });

    expect(mockAssertNotBanned).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user_1" }),
    );
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acct_w" },
        data: { providerData: expect.objectContaining({ counter: 7 }) },
      }),
    );
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe("user_1");
    expect(result.session.id).toBe("sess_1");
    // Accounts are stripped from the public user.
    expect((result.user as { accounts?: unknown }).accounts).toBeUndefined();
  });

  it("returns 400 when verification throws", async () => {
    seedAuthChallenge();
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      accounts: [
        {
          id: "acct_w",
          providerId: "webauthn",
          providerData: {
            credentialId: "cred-1",
            publicKey: encodeBase64("pk"),
            counter: 0,
          },
        },
      ],
    });
    mockVerifyAuthenticationResponse.mockRejectedValue(new Error("bad sig"));

    await expectStatus(
      () =>
        verifyAuthentication({
          email: "jane@example.com",
          credential: authResponse,
        }),
      400,
    );
  });

  it("returns 400 when clientDataJSON is not valid JSON", async () => {
    const response = {
      ...authResponse,
      response: {
        ...authResponse.response,
        clientDataJSON: encodeBase64("definitely not json"),
      },
    } as unknown as AuthenticationResponseJSON;

    await expectStatus(
      () =>
        verifyAuthentication({
          email: "jane@example.com",
          credential: response,
        }),
      400,
    );
  });
});

describe("removeWebAuthnCredential", () => {
  it("returns 404 when the credential does not exist", async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);

    await expectStatus(() => removeWebAuthnCredential("user_1", "acct_x"), 404);
  });

  it("returns 400 when removing the last credential with no fallback auth method", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: "acct_w" });
    mockPrisma.account.count
      .mockResolvedValueOnce(1) // webauthnCount
      .mockResolvedValueOnce(0); // otherAuthCount

    await expectStatus(() => removeWebAuthnCredential("user_1", "acct_w"), 400);
    expect(mockPrisma.account.delete).not.toHaveBeenCalled();
  });

  it("deletes when other WebAuthn credentials exist", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: "acct_w" });
    mockPrisma.account.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await removeWebAuthnCredential("user_1", "acct_w");

    expect(mockPrisma.account.delete).toHaveBeenCalledWith({
      where: { id: "acct_w" },
    });
  });

  it("deletes when the user has a password account as fallback", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: "acct_w" });
    mockPrisma.account.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await removeWebAuthnCredential("user_1", "acct_w");

    expect(mockPrisma.account.delete).toHaveBeenCalledWith({
      where: { id: "acct_w" },
    });
  });
});
