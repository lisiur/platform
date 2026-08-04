import { describe, expect, it } from "vitest";
import {
  listNotificationProviders,
  redactNotificationProviderConfig,
  validateNotificationProviderConfig,
} from "./provider";

describe("notification providers", () => {
  it("lists the built-in provider types", () => {
    expect(listNotificationProviders().map((provider) => provider.key)).toEqual(
      ["in-app", "smtp-email", "sms"],
    );
  });

  it("validates smtp email config", () => {
    const config = validateNotificationProviderConfig("smtp-email", {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "mailer",
      password: "secret",
      from: "noreply@example.com",
    });

    expect(config).toMatchObject({ host: "smtp.example.com", port: 587 });
  });

  it("rejects invalid sms config", () => {
    expect(() =>
      validateNotificationProviderConfig("sms", { providerName: "demo" }),
    ).toThrow("Invalid sms provider config");
  });

  it("redacts provider secrets", () => {
    expect(
      redactNotificationProviderConfig("smtp-email", {
        host: "smtp.example.com",
        password: "secret",
      }),
    ).toEqual({ host: "smtp.example.com", password: "********" });
  });

  it("rejects CR/LF in smtp from field (header injection)", () => {
    expect(() =>
      validateNotificationProviderConfig("smtp-email", {
        host: "smtp.example.com",
        port: 587,
        from: "noreply@example.com\r\nBcc: leak@example.com",
      }),
    ).toThrow("Invalid smtp-email provider config");
  });

  it("rejects a bare non-email in smtp from field", () => {
    expect(() =>
      validateNotificationProviderConfig("smtp-email", {
        host: "smtp.example.com",
        port: 587,
        from: "not-an-email",
      }),
    ).toThrow("Invalid smtp-email provider config");
  });

  it("accepts 'Name <email>' form for smtp from", () => {
    const config = validateNotificationProviderConfig("smtp-email", {
      host: "smtp.example.com",
      port: 587,
      from: "Team <noreply@example.com>",
    });

    expect(config).toMatchObject({ host: "smtp.example.com", port: 587 });
  });
});
