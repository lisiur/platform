import type { WebAuthnProviderData, WechatProviderData } from "#types/account";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Reads the hashed password from a credential account's `providerData`.
 * Returns `undefined` when the account has no password credential.
 */
export function getCredentialPassword(
  providerData: unknown,
): string | undefined {
  const record = asRecord(providerData);
  if (record && "password" in record) {
    return String(record.password);
  }
  return undefined;
}

/**
 * Returns the wechat provider data, or an empty object when the stored
 * payload does not look like one. Never throws on corrupted JSON shapes.
 *
 * The result is `Partial<WechatProviderData>` because the whole point of
 * this helper is to handle unknown / partially-stored payloads safely.
 */
export function getWechatProviderData(
  providerData: unknown,
): Partial<WechatProviderData> {
  const record = asRecord(providerData);
  if (record && "accessToken" in record) {
    return record as unknown as Partial<WechatProviderData>;
  }
  return {};
}

/**
 * Returns the WebAuthn credential payload, or `null` when the stored
 * payload does not look like a WebAuthn credential.
 */
export function getWebAuthnProviderData(
  providerData: unknown,
): WebAuthnProviderData | null {
  const record = asRecord(providerData);
  if (record && "credentialId" in record && "publicKey" in record) {
    return record as unknown as WebAuthnProviderData;
  }
  return null;
}
