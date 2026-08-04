import { describe, expect, it } from "vitest";
import {
  getCredentialPassword,
  getWebAuthnProviderData,
  getWechatProviderData,
} from "./account-provider-data";

describe("getCredentialPassword", () => {
  it("returns the password string for a credential account", () => {
    expect(getCredentialPassword({ password: "hashed:secret" })).toBe(
      "hashed:secret",
    );
  });

  it("returns undefined when providerData is null", () => {
    expect(getCredentialPassword(null)).toBeUndefined();
  });

  it("returns undefined when providerData is a non-object primitive", () => {
    expect(getCredentialPassword("string")).toBeUndefined();
    expect(getCredentialPassword(42)).toBeUndefined();
  });

  it("returns undefined when the password field is absent", () => {
    expect(getCredentialPassword({ accessToken: "abc" })).toBeUndefined();
  });

  it("coerces numeric / boolean values to string", () => {
    // Defensive: corrupted JSON shape — helper must not throw.
    expect(getCredentialPassword({ password: 123 })).toBe("123");
    expect(getCredentialPassword({ password: true })).toBe("true");
  });
});

describe("getWechatProviderData", () => {
  it("returns the data when it looks like a wechat payload", () => {
    const data = { accessToken: "abc", refreshToken: "xyz" };
    expect(getWechatProviderData(data)).toEqual(data);
  });

  it("returns an empty object when the payload is not wechat-shaped", () => {
    expect(getWechatProviderData({ password: "hashed" })).toEqual({});
    expect(getWechatProviderData(null)).toEqual({});
    expect(getWechatProviderData("string")).toEqual({});
  });
});

describe("getWebAuthnProviderData", () => {
  it("returns the data when it looks like a WebAuthn payload", () => {
    const data = {
      credentialId: "cred-1",
      publicKey: "pk",
      counter: 0,
      deviceType: "platform" as const,
    };
    expect(getWebAuthnProviderData(data)).toEqual(data);
  });

  it("returns null for password-shaped payloads", () => {
    expect(getWebAuthnProviderData({ password: "hashed" })).toBeNull();
  });

  it("returns null for null / primitives", () => {
    expect(getWebAuthnProviderData(null)).toBeNull();
    expect(getWebAuthnProviderData("x")).toBeNull();
  });
});
