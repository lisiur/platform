import { describe, expect, it, vi } from "vitest";

// pipeline.ts imports ./pm2, which derives the app list from DEPLOY_ROOT's
// manifest.json at module load and throws when it is absent (correct in
// production, where assemble.sh always ships it). The pure helpers under
// test here don't need it — mock the module to keep the import chain clean.
vi.mock("./pm2", () => ({
  deleteApps: vi.fn(),
  reloadApps: vi.fn(),
  saveProcessList: vi.fn(),
  startApps: vi.fn(),
}));

import {
  isEscapingTarPath,
  isSymlinkTargetEscaping,
  parseTarSymlinkLine,
} from "./pipeline";

// ─── isEscapingTarPath ──────────────────────────────────────────────────────

describe("isEscapingTarPath (entry names)", () => {
  it("accepts a plain relative path", () => {
    expect(isEscapingTarPath("apps/gateway/server.js")).toBe(false);
  });

  it("rejects an absolute path", () => {
    expect(isEscapingTarPath("/etc/passwd")).toBe(true);
  });

  it("rejects a path that walks up", () => {
    expect(isEscapingTarPath("../foo")).toBe(true);
    expect(isEscapingTarPath("apps/../../../etc/passwd")).toBe(true);
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(isEscapingTarPath("..\\foo")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isEscapingTarPath("")).toBe(true);
    expect(isEscapingTarPath("   ")).toBe(true);
  });
});

// ─── isSymlinkTargetEscaping ───────────────────────────────────────────────

describe("isSymlinkTargetEscaping", () => {
  describe("legitimate pnpm / Next.js standalone symlinks", () => {
    // The exact case from the v0.0.52/v0.0.53 deploy failure: Next's
    // standalone output creates <deploy>/apps/<name>/apps/<name>/node_modules/<pkg>
    // symlinked to a sibling inside .pnpm/. Parent depth is 4, the target
    // walks up 3 levels — well within DEPLOY_ROOT.
    it("accepts the apps/<name>/apps/<name>/node_modules/next symlink", () => {
      const entry = "apps/gateway/apps/gateway/node_modules/next";
      const target =
        "../../../node_modules/.pnpm/next@16.2.6_@opentelemetry+api@1.9.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next";
      expect(isSymlinkTargetEscaping(entry, target)).toBe(false);
    });

    it("accepts a shallow symlink with .. back-and-forth", () => {
      // <a>/b -> ../b resolves to <a>/b (stays inside).
      expect(isSymlinkTargetEscaping("a/b", "../b")).toBe(false);
    });
  });

  describe("absolute targets", () => {
    it("rejects absolute targets", () => {
      expect(isSymlinkTargetEscaping("apps/gw/foo", "/etc/passwd")).toBe(true);
    });

    it("rejects targets with absolute prefixes after backslash normalization", () => {
      expect(isSymlinkTargetEscaping("apps/gw/foo", "\\etc\\passwd")).toBe(
        true,
      );
    });
  });

  describe("traversal past DEPLOY_ROOT", () => {
    it("rejects a target that escapes via too many ..", () => {
      // entry lives at apps/gateway/node_modules/x (parent depth 3); the
      // target has 4 leading ".." — the 4th walks past DEPLOY_ROOT.
      expect(
        isSymlinkTargetEscaping(
          "apps/gateway/node_modules/x",
          "../../../../etc/passwd",
        ),
      ).toBe(true);
    });

    it("rejects an over-escalating target from a shallow entry", () => {
      // entry at deploy root (depth 0), one .. already escapes.
      expect(isSymlinkTargetEscaping("x", "../etc/passwd")).toBe(true);
    });

    it("accepts a target whose .. exactly matches the parent depth", () => {
      // entry at deploy root (depth 0), no .. needed.
      expect(isSymlinkTargetEscaping("x", "foo/bar")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("rejects an empty target", () => {
      expect(isSymlinkTargetEscaping("a/b", "")).toBe(true);
      expect(isSymlinkTargetEscaping("a/b", "   ")).toBe(true);
    });

    it("ignores .. after a non-.. segment", () => {
      // Leading non-".." segment anchors the path; subsequent ".." are
      // fine (they don't escape DEPLOY_ROOT, they just navigate further).
      expect(isSymlinkTargetEscaping("a", "b/../../foo")).toBe(false);
    });
  });
});

// ─── parseTarSymlinkLine ────────────────────────────────────────────────────

describe("parseTarSymlinkLine", () => {
  it("parses a typical GNU tar verbose line", () => {
    const line =
      "lrwxrwxrwx hapaul/hapaul     0 Aug  5 11:50 sym/d/eep/parent/link -> ../../../legit";
    expect(parseTarSymlinkLine(line)).toEqual({
      name: "sym/d/eep/parent/link",
      target: "../../../legit",
    });
  });

  it("parses a bsdtar-style line (space-separated owner group)", () => {
    const line =
      "lrwxr-xr-x  0 lisiur wheel       0 Aug 27 11:29 sym/d/eep/parent/link -> ../../../legit";
    expect(parseTarSymlinkLine(line)).toEqual({
      name: "sym/d/eep/parent/link",
      target: "../../../legit",
    });
  });

  it("parses the actual Next.js standalone symlink line", () => {
    const line =
      "lrwxrwxrwx  0 hapaul hapaul  39 Aug  5 11:50 apps/gateway/apps/gateway/node_modules/next -> ../../../node_modules/.pnpm/next@16.2.6_@opentelemetry+api@1.9.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next";
    const parts = parseTarSymlinkLine(line);
    expect(parts?.name).toBe("apps/gateway/apps/gateway/node_modules/next");
    expect(parts?.target).toBe(
      "../../../node_modules/.pnpm/next@16.2.6_@opentelemetry+api@1.9.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next",
    );
  });

  it("returns null for non-symlink lines", () => {
    expect(
      parseTarSymlinkLine(
        "-rw-r--r--  0 hapaul hapaul  1234 Aug  5 11:50 file",
      ),
    ).toBeNull();
  });

  it("returns null for lines without ` -> `", () => {
    expect(
      parseTarSymlinkLine("lrwxrwxrwx 0 hapaul hapaul 0 Aug  5 11:50 broken"),
    ).toBeNull();
  });

  it("handles full-time dates (HH:MM:SS)", () => {
    const line =
      "lrwxrwxrwx  0 hapaul hapaul  0 2026-08-27 07:29:24 apps/gateway/apps/gateway/node_modules/next -> ../../../node_modules/.pnpm/next@16.2.6_@opentelemetry+api@1.9.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next";
    const parts = parseTarSymlinkLine(line);
    expect(parts?.name).toBe("apps/gateway/apps/gateway/node_modules/next");
  });
});
