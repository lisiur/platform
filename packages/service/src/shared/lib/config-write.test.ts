import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { APPLICATION_CONFIG_INDEX } from "#modules/application/application-config.registry";
import { SYSTEM_CONFIG_INDEX } from "#modules/system/system-config.registry";
import { validateConfigWrite } from "./config-write";

/** Asserts that fn throws an HTTPException with status 400. */
function expect400(fn: () => unknown) {
  try {
    fn();
    throw new Error("expected fn to throw");
  } catch (e) {
    expect(e).toBeInstanceOf(HTTPException);
    expect((e as HTTPException).status).toBe(400);
  }
}

describe("validateConfigWrite", () => {
  describe("allowlist", () => {
    it("rejects unknown (group, key) with 400", () => {
      expect400(() =>
        validateConfigWrite(SYSTEM_CONFIG_INDEX, "evil", "backdoor", "x"),
      );
      expect400(() =>
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "auth",
          "registration.self",
          "true",
        ),
      );
    });

    it("accepts a known (group, key)", () => {
      const row = validateConfigWrite(
        SYSTEM_CONFIG_INDEX,
        "auth",
        "registration.enabled",
        "true",
      );
      expect(row.value).toBe("true");
    });
  });

  describe("boolean keys", () => {
    it("accepts true / false", () => {
      expect(
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "auth",
          "registration.enabled",
          "true",
        ).value,
      ).toBe("true");
      expect(
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "auth",
          "registration.enabled",
          "false",
        ).value,
      ).toBe("false");
    });

    it("rejects non-boolean garbage", () => {
      expect400(() =>
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "auth",
          "registration.enabled",
          "yes",
        ),
      );
    });

    // Regression for the empty-reset bug: "" means "unset → env fallback".
    it("accepts empty string as the unset sentinel", () => {
      expect(
        validateConfigWrite(SYSTEM_CONFIG_INDEX, "webauthn", "enabled", "")
          .value,
      ).toBe("");
      expect(
        validateConfigWrite(
          APPLICATION_CONFIG_INDEX,
          "ai-agent-ui",
          "showReasoning",
          "",
        ).value,
      ).toBe("");
    });
  });

  describe("number keys", () => {
    it("accepts a non-negative integer string", () => {
      expect(
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "rate-limit",
          "global.max",
          "300",
        ).value,
      ).toBe("300");
    });

    it("rejects non-numeric input", () => {
      expect400(() =>
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "rate-limit",
          "global.max",
          "abc",
        ),
      );
    });

    // Deliberate: "" would coerce to 0 at read time — a deny-all footgun for
    // rate-limit.max. Reset numbers via delete, not empty upsert.
    it("rejects empty string (numbers stay strict by design)", () => {
      expect400(() =>
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "rate-limit",
          "global.max",
          "",
        ),
      );
    });
  });

  describe("select keys", () => {
    it("accepts a valid option and empty (reset)", () => {
      expect(
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "self-update",
          "source",
          "github",
        ).value,
      ).toBe("github");
      expect(
        validateConfigWrite(SYSTEM_CONFIG_INDEX, "self-update", "source", "")
          .value,
      ).toBe("");
    });

    it("rejects an option not in the registry", () => {
      expect400(() =>
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "self-update",
          "source",
          "nuke",
        ),
      );
    });
  });

  describe("json keys", () => {
    it("validates upload.hotlink as JSON", () => {
      const value = JSON.stringify({
        enabled: false,
        allowedDomains: ["example.com"],
        allowEmptyReferer: true,
      });
      expect(
        validateConfigWrite(SYSTEM_CONFIG_INDEX, "upload", "hotlink", value)
          .value,
      ).toBe(value);
    });

    it("rejects malformed JSON", () => {
      expect400(() =>
        validateConfigWrite(
          SYSTEM_CONFIG_INDEX,
          "upload",
          "hotlink",
          "not json",
        ),
      );
    });
  });

  describe("registry-authoritative metadata", () => {
    // The caller cannot influence isSecret/mask/type — only `value` is theirs.
    // Guards against flipping isSecret:false on a secret to de-mask it.
    it("returns the registry's isSecret/mask regardless of caller input", () => {
      const row = validateConfigWrite(
        SYSTEM_CONFIG_INDEX,
        "wechat",
        "secret",
        "sk-xxxxxxxxxxxx",
      );
      expect(row.isSecret).toBe(true);
      expect(row.mask).toBe("start{4}.{*}");
      expect(row.type).toBe("string");

      const pub = validateConfigWrite(
        SYSTEM_CONFIG_INDEX,
        "rate-limit",
        "trustProxy",
        "loopback",
      );
      expect(pub.isSecret).toBe(false);
      expect(pub.type).toBe("string");
    });
  });
});
