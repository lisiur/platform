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
});
