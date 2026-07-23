import type {
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { HTTPException } from "hono/http-exception";
import { getWebAuthnProviderData } from "#lib/account-provider-data";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import { createSession } from "#lib/session";
import { systemConfigRepository } from "#repositories/system-config.repository";
import {
  assertNotBanned,
  getDefaultActiveOrganizationId,
} from "#services/auth.service";
import { webauthnChallengeCache } from "#states/cache";
import type { WebAuthnProviderData } from "#types/account";
import type { WebAuthnChallenge } from "#types/webauthn";

const CHALLENGE_TIMEOUT_MS = 5 * 60 * 1000;

type AuthenticatorAttachment = "platform" | "cross-platform";

function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const DEFAULT_PLATFORM_NAME = "This Device";
const DEFAULT_CROSS_PLATFORM_NAME = "Security Key";

/**
 * Derives a human-friendly device name. The browser's `clientDataJSON.origin`
 * is the *website* origin, not the OS — so we cannot reliably detect
 * "Mac Touch ID" / "Windows Hello" etc. server-side. Instead:
 *   1. Use the client-supplied `deviceName` when provided.
 *   2. Fall back to a short label derived from `authenticatorAttachment`
 *      and the credential's reported `transports`.
 */
function deriveDeviceName(params: {
  deviceName?: string;
  authenticatorAttachment?: AuthenticatorAttachment;
  transports?: AuthenticatorTransportFuture[];
}): string {
  const { deviceName, authenticatorAttachment, transports } = params;
  if (deviceName && deviceName.trim().length > 0) {
    return deviceName.trim();
  }

  if (authenticatorAttachment !== "cross-platform") {
    return DEFAULT_PLATFORM_NAME;
  }

  const labels: string[] = [];
  if (transports?.includes("usb")) labels.push("USB");
  if (transports?.includes("nfc")) labels.push("NFC");
  if (transports?.includes("ble")) labels.push("Bluetooth");
  if (transports?.includes("hybrid")) labels.push("Hybrid");
  if (labels.length > 0) {
    return `${DEFAULT_CROSS_PLATFORM_NAME} (${labels.join(" / ")})`;
  }

  return DEFAULT_CROSS_PLATFORM_NAME;
}

async function getWebAuthnConfig() {
  const [rpNameConfig, rpIdConfig, originConfig] = await Promise.all([
    systemConfigRepository.findByGroupAndKey("webauthn", "rp.name"),
    systemConfigRepository.findByGroupAndKey("webauthn", "rp.id"),
    systemConfigRepository.findByGroupAndKey("webauthn", "origin"),
  ]);
  const rpID = rpIdConfig?.value || process.env.WEBAUTHN_RP_ID || "localhost";
  const origin =
    originConfig?.value || process.env.WEBAUTHN_ORIGIN || `https://${rpID}`;
  return {
    rpName: rpNameConfig?.value || "My Application",
    rpID,
    origin,
  };
}

/**
 * Whether WebAuthn (passkey) sign-in / registration is enabled.
 * Defaults to `false` when the config row is missing — matching the
 * registration-enabled convention.
 */
export async function getWebAuthnEnabled(): Promise<boolean> {
  const config = await systemConfigRepository.findByGroupAndKey(
    "webauthn",
    "enabled",
  );
  return config?.value === "true";
}

/**
 * Throws 403 when WebAuthn is globally disabled. Used by the public
 * WebAuthn routes so the feature can be turned off without code changes.
 */
export async function assertWebAuthnEnabled(): Promise<void> {
  if (!(await getWebAuthnEnabled())) {
    throw new HTTPException(403, {
      message: "WebAuthn sign-in is disabled",
    });
  }
}

export async function generateRegistrationOptions(userId: string) {
  const { generateRegistrationOptions: generateOptions } = await import(
    "@simplewebauthn/server"
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const existingCredentials = user.accounts
    .filter((account) => account.providerId === "webauthn")
    .map((account) => getWebAuthnProviderData(account.providerData))
    .filter((data): data is WebAuthnProviderData => data !== null)
    .map((data) => data.credentialId);

  const { rpName, rpID } = await getWebAuthnConfig();

  const options = await generateOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred,
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      userVerification: "required",
      residentKey: "preferred",
    },
  });

  const challengeData: WebAuthnChallenge = {
    userId: user.id,
    challenge: options.challenge,
    expiresAt: Date.now() + CHALLENGE_TIMEOUT_MS,
  };

  webauthnChallengeCache.set(`register:${options.challenge}`, challengeData, {
    ttl: challengeData.expiresAt - Date.now(),
  });

  return {
    ...options,
    timeout: CHALLENGE_TIMEOUT_MS,
  };
}

export async function verifyRegistration(params: {
  userId: string;
  credential: RegistrationResponseJSON;
  deviceName?: string;
  traceId?: string;
}) {
  const { verifyRegistrationResponse: verifyResponse } = await import(
    "@simplewebauthn/server"
  );

  const { credential, userId, deviceName, traceId } = params;

  const challenge = credential.response.clientDataJSON;
  let clientDataObj: { challenge?: string };
  try {
    clientDataObj = JSON.parse(
      new TextDecoder().decode(base64ToBuffer(challenge)),
    );
  } catch {
    throw new HTTPException(400, { message: "Invalid credential data" });
  }
  const challengeKey = `register:${clientDataObj.challenge}`;

  const challengeData =
    webauthnChallengeCache.get<WebAuthnChallenge>(challengeKey);

  if (!challengeData) {
    throw new HTTPException(400, { message: "Invalid challenge" });
  }

  if (challengeData.expiresAt < Date.now()) {
    webauthnChallengeCache.delete(challengeKey);
    throw new HTTPException(400, { message: "Challenge expired" });
  }

  webauthnChallengeCache.delete(challengeKey);

  if (challengeData.userId !== userId) {
    throw new HTTPException(400, { message: "Challenge user mismatch" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const { rpID, origin } = await getWebAuthnConfig();

  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyResponse({
      response: credential,
      expectedChallenge: clientDataObj.challenge ?? "",
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    console.error("WebAuthn verification error:", err);
    throw new HTTPException(400, {
      message: "Credential verification failed",
    });
  }

  const { registrationInfo } = verification;
  if (!registrationInfo) {
    throw new HTTPException(400, { message: "No registration info" });
  }

  const resolvedDeviceName = deriveDeviceName({
    deviceName,
    authenticatorAttachment: credential.authenticatorAttachment as
      | AuthenticatorAttachment
      | undefined,
    transports: credential.response.transports,
  });

  const credentialData: WebAuthnProviderData = {
    credentialId: registrationInfo.credential.id,
    publicKey: bufferToBase64(registrationInfo.credential.publicKey),
    counter: registrationInfo.credential.counter,
    deviceType:
      credential.authenticatorAttachment === "platform"
        ? "platform"
        : "cross-platform",
    deviceName: resolvedDeviceName,
  };

  const account = await prisma.account
    .create({
      data: {
        accountId: credentialData.credentialId,
        providerId: "webauthn",
        userId: user.id,
        providerData: credentialData,
      },
    })
    .catch((err: unknown) => {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2002"
      ) {
        throw new HTTPException(400, {
          message: "Credential already registered",
        });
      }
      throw err;
    });

  await logAudit({
    traceId,
    userId: user.id,
    userName: user.name,
    authType: "session",
    authTokenId: undefined,
    event: "auth.webauthn_register",
    category: "authentication",
  });

  return {
    id: account.id,
    credentialId: credentialData.credentialId,
    deviceType: credentialData.deviceType,
    deviceName: credentialData.deviceName,
    createdAt: account.createdAt,
  };
}

export async function generateAuthenticationOptions(email?: string) {
  const { generateAuthenticationOptions: generateOptions } = await import(
    "@simplewebauthn/server"
  );

  const { rpID } = await getWebAuthnConfig();

  // Discoverable credential path: no email → let the authenticator pick
  if (!email) {
    const options = await generateOptions({
      rpID,
      allowCredentials: [],
      userVerification: "required",
    });

    const challengeData: WebAuthnChallenge = {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TIMEOUT_MS,
    };

    webauthnChallengeCache.set(`auth:${options.challenge}`, challengeData, {
      ttl: challengeData.expiresAt - Date.now(),
    });

    return {
      ...options,
      timeout: CHALLENGE_TIMEOUT_MS,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { accounts: true },
  });

  // To avoid user enumeration, return a valid-looking challenge with an
  // empty allowCredentials list for unknown users or users without
  // WebAuthn credentials. Verification will always fail for these cases,
  // producing the same error an attacker would see for a wrong credential.
  const webauthnAccounts = (user?.accounts ?? []).filter(
    (account) => account.providerId === "webauthn",
  );

  const allowCredentials = webauthnAccounts
    .map((account) => {
      const data = getWebAuthnProviderData(account.providerData);
      if (!data?.credentialId) return null;
      return {
        id: data.credentialId,
        type: "public-key" as const,
      };
    })
    .filter(Boolean) as Array<{ id: string; type: "public-key" }>;

  const options = await generateOptions({
    rpID,
    allowCredentials,
    userVerification: "required",
  });

  // Store the challenge only when there is a real user to verify against.
  // Unknown users get a throwaway challenge that cannot pass verification.
  if (user && allowCredentials.length > 0) {
    const challengeData: WebAuthnChallenge = {
      userId: user.id,
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TIMEOUT_MS,
    };

    webauthnChallengeCache.set(`auth:${options.challenge}`, challengeData, {
      ttl: challengeData.expiresAt - Date.now(),
    });
  }

  return {
    ...options,
    timeout: CHALLENGE_TIMEOUT_MS,
  };
}

export async function verifyAuthentication(params: {
  email?: string;
  credential: AuthenticationResponseJSON;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceId?: string;
}) {
  const { verifyAuthenticationResponse: verifyResponse } = await import(
    "@simplewebauthn/server"
  );

  const { credential, email, ipAddress, userAgent, traceId } = params;

  // Use a single generic error for every failure path to avoid leaking
  // whether the email exists or has WebAuthn credentials enrolled.
  // Each failure is audit-logged with a distinct reason for monitoring.
  const fail = async (reason: string, userId?: string): Promise<never> => {
    await logAudit({
      traceId,
      userId,
      event: "auth.login_failed",
      category: "authentication",
      outcome: "failure",
      severity: "warning",
      metadata: {
        email,
        ipAddress,
        userAgent,
        reason: `webauthn_${reason}`,
      },
    });
    throw new HTTPException(400, { message: "Authentication failed" });
  };

  const challenge = credential.response.clientDataJSON;
  let clientDataObj: { challenge?: string };
  try {
    clientDataObj = JSON.parse(
      new TextDecoder().decode(base64ToBuffer(challenge)),
    );
  } catch {
    return fail("invalid_credential_data");
  }
  const challengeKey = `auth:${clientDataObj.challenge}`;

  const challengeData =
    webauthnChallengeCache.get<WebAuthnChallenge>(challengeKey);

  if (!challengeData) {
    return fail("invalid_challenge");
  }

  if (challengeData.expiresAt < Date.now()) {
    webauthnChallengeCache.delete(challengeKey);
    return fail("challenge_expired");
  }

  webauthnChallengeCache.delete(challengeKey);

  // Discoverable credential path: identify user via userHandle (base64url-encoded userId)
  const userHandle = credential.response.userHandle;
  let userId: string | undefined;

  if (!email && userHandle) {
    try {
      userId = new TextDecoder().decode(base64ToBuffer(userHandle));
    } catch {
      return fail("invalid_user_handle");
    }
  }

  // Look up user: by email (server-side discovery) or by decoded userId (discoverable)
  const user = email
    ? await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { accounts: true },
      })
    : userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          include: { accounts: true },
        })
      : null;

  if (!user) {
    if (!email && !userId) {
      return fail("no_identity");
    }
    return fail("unknown_user");
  }

  // For email-based flow, verify challenge userId matches
  if (challengeData.userId && challengeData.userId !== user.id) {
    return fail("user_mismatch", user.id);
  }

  assertNotBanned(user);

  const account = user.accounts.find((a) => {
    if (a.providerId !== "webauthn") return false;
    const data = getWebAuthnProviderData(a.providerData);
    return data?.credentialId === credential.id;
  });

  if (!account) {
    return fail("no_credential", user.id);
  }

  const credentialData = getWebAuthnProviderData(account.providerData);
  if (!credentialData) {
    return fail("corrupted_credential", user.id);
  }

  const { rpID, origin } = await getWebAuthnConfig();

  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyResponse({
      response: credential,
      expectedChallenge: clientDataObj.challenge ?? "",
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credentialData.credentialId,
        publicKey: new Uint8Array(base64ToBuffer(credentialData.publicKey)),
        counter: credentialData.counter,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    console.error("WebAuthn authentication error:", err);
    return fail("verification_failed", user.id);
  }

  const { authenticationInfo } = verification;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      providerData: {
        ...credentialData,
        counter: authenticationInfo.newCounter,
      },
    },
  });

  const session = await createSession({
    userId: user.id,
    ipAddress,
    userAgent,
    activeOrganizationId: await getDefaultActiveOrganizationId(user.id),
  });

  await logAudit({
    traceId,
    userId: user.id,
    userName: user.name,
    authType: "session",
    authTokenId: session.id,
    event: "auth.login",
    category: "authentication",
    metadata: {
      ipAddress,
      userAgent,
      credentialId: credential.id,
    },
  });

  const { accounts: _accounts, ...publicUser } = user;
  return { user: publicUser, session };
}

export async function getUserWebAuthnCredentials(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId, providerId: "webauthn" },
  });

  return accounts
    .map((account) => {
      const data = getWebAuthnProviderData(account.providerData);
      if (!data?.credentialId) return null;
      return {
        id: account.id,
        credentialId: data.credentialId,
        deviceType: data.deviceType,
        deviceName: data.deviceName || "Unnamed Device",
        createdAt: account.createdAt,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    credentialId: string;
    deviceType: "platform" | "cross-platform";
    deviceName: string;
    createdAt: Date;
  }>;
}

export async function removeWebAuthnCredential(
  userId: string,
  credentialId: string,
) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "webauthn",
      id: credentialId,
    },
  });

  if (!account) {
    throw new HTTPException(404, { message: "Credential not found" });
  }

  const [webauthnCount, otherAuthCount] = await Promise.all([
    prisma.account.count({
      where: { userId, providerId: "webauthn" },
    }),
    prisma.account.count({
      where: {
        userId,
        providerId: { not: "webauthn" },
      },
    }),
  ]);

  // Prevent locking the user out: if this is their last WebAuthn credential
  // and they have no other auth method (password / oauth), refuse removal.
  if (webauthnCount <= 1 && otherAuthCount === 0) {
    throw new HTTPException(400, {
      message:
        "Cannot remove the last remaining sign-in method. Add a password or another credential first.",
    });
  }

  await prisma.account.delete({
    where: { id: account.id },
  });
}
