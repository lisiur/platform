import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRUST,
  parseTrust,
  resolveClientIp,
  type TrustSpec,
} from "./client-ip";

describe("parseTrust", () => {
  it("returns default for undefined/empty", () => {
    const t = parseTrust(undefined);
    expect(t.rules).toEqual([]);
  });

  it("returns default for 'none'", () => {
    const t = parseTrust("none");
    expect(t.rules).toEqual([]);
  });

  it("returns all-trusted for 'all'", () => {
    const t = parseTrust("all");
    expect(t.rules.some((r) => r.kind === "keyword" && r.name === "all")).toBe(
      true,
    );
  });

  it("parses keywords", () => {
    const t = parseTrust("loopback,uniqueLocal,linkLocal");
    expect(t.rules).toContainEqual({ kind: "keyword", name: "loopback" });
    expect(t.rules).toContainEqual({ kind: "keyword", name: "uniqueLocal" });
    expect(t.rules).toContainEqual({ kind: "keyword", name: "linkLocal" });
  });

  it("parses explicit CIDR", () => {
    const t = parseTrust("10.0.0.0/8");
    const rule = t.rules.find((r) => r.kind === "cidr");
    expect(rule).toBeTruthy();
    expect(rule?.prefixLength).toBe(8);
  });

  it("parses single IP as /32 or /128", () => {
    const t = parseTrust("192.168.1.1");
    const rule = t.rules.find((r) => r.kind === "ip");
    expect(rule).toBeTruthy();
    expect(rule?.ip.toString()).toBe("192.168.1.1");
  });

  it("skips unknown tokens gracefully", () => {
    const t = parseTrust("notarealtoken,10.0.0.0/8");
    expect(t.rules.some((r) => r.kind === "cidr")).toBe(true);
  });
});

describe("resolveClientIp", () => {
  const defaultTrust: TrustSpec = parseTrust(DEFAULT_TRUST);

  function makeTrust(raw: string): TrustSpec {
    return parseTrust(raw);
  }

  it("returns peer when untrusted and no XFF", () => {
    const result = resolveClientIp({
      peerIp: "203.0.113.9",
      xForwardedFor: undefined,
      xRealIp: undefined,
      trust: makeTrust("none"),
    });
    expect(result).toBe("203.0.113.9");
  });

  it("returns peer and ignores spoofed XFF when peer is not trusted", () => {
    const result = resolveClientIp({
      peerIp: "203.0.113.9",
      xForwardedFor: "1.2.3.4,5.6.7.8",
      xRealIp: undefined,
      trust: makeTrust("none"),
    });
    expect(result).toBe("203.0.113.9");
  });

  it("returns first untrusted entry when peer is trusted", () => {
    const result = resolveClientIp({
      peerIp: "127.0.0.1",
      xForwardedFor: "1.2.3.4,5.6.7.8",
      xRealIp: undefined,
      trust: makeTrust("loopback"),
    });
    expect(result).toBe("5.6.7.8");
  });

  it("walks right-to-left, skipping trusted hops", () => {
    const result = resolveClientIp({
      peerIp: "127.0.0.1",
      xForwardedFor: "8.8.8.8,10.0.0.10,10.0.0.1",
      xRealIp: undefined,
      trust: makeTrust("loopback"),
    });
    expect(result).toBe("10.0.0.1");
  });

  it("matches uniquelocal keyword for IPv6 unique-local addresses", () => {
    const result = resolveClientIp({
      peerIp: "fd00::1",
      xForwardedFor: "8.8.8.8",
      xRealIp: undefined,
      trust: makeTrust("uniqueLocal"),
    });
    expect(result).toBe("8.8.8.8");
  });

  it("matches linklocal keyword for IPv4 link-local addresses", () => {
    const result = resolveClientIp({
      peerIp: "169.254.1.1",
      xForwardedFor: "8.8.8.8",
      xRealIp: undefined,
      trust: makeTrust("linkLocal"),
    });
    expect(result).toBe("8.8.8.8");
  });

  it("linklocal keyword does not match reserved-range addresses", () => {
    const result = resolveClientIp({
      peerIp: "240.0.0.1",
      xForwardedFor: "8.8.8.8",
      xRealIp: undefined,
      trust: makeTrust("linkLocal"),
    });
    expect(result).toBe("240.0.0.1");
  });

  it("matches explicit IP rule", () => {
    const result = resolveClientIp({
      peerIp: "192.168.1.50",
      xForwardedFor: "8.8.8.8",
      xRealIp: undefined,
      trust: makeTrust("192.168.1.50"),
    });
    expect(result).toBe("8.8.8.8");
  });

  it("falls back to xRealIp when all XFF entries are trusted", () => {
    const result = resolveClientIp({
      peerIp: "127.0.0.1",
      xForwardedFor: "10.0.0.1,10.0.0.2",
      xRealIp: "203.0.113.5",
      trust: makeTrust("loopback,10.0.0.0/8"),
    });
    expect(result).toBe("203.0.113.5");
  });

  it("falls back to peer when all trusted and no xRealIp", () => {
    const result = resolveClientIp({
      peerIp: "192.168.1.1",
      xForwardedFor: "10.0.0.1,10.0.0.2",
      xRealIp: undefined,
      trust: makeTrust("10.0.0.0/8"),
    });
    expect(result).toBe("192.168.1.1");
  });

  it("returns unknown when peer is null, no XFF, no xRealIp", () => {
    const result = resolveClientIp({
      peerIp: null,
      xForwardedFor: undefined,
      xRealIp: undefined,
      trust: defaultTrust,
    });
    expect(result).toBe("unknown");
  });

  it("handles empty XFF string gracefully", () => {
    const result = resolveClientIp({
      peerIp: "203.0.113.9",
      xForwardedFor: "  ",
      xRealIp: undefined,
      trust: makeTrust("none"),
    });
    expect(result).toBe("203.0.113.9");
  });

  it("normalizes IPv4-mapped IPv6", () => {
    const result = resolveClientIp({
      peerIp: "::ffff:192.168.1.1",
      xForwardedFor: undefined,
      xRealIp: undefined,
      trust: makeTrust("192.168.0.0/16"),
    });
    expect(result).toBe("192.168.1.1");
  });

  it("'all' keyword trusts everything", () => {
    const result = resolveClientIp({
      peerIp: "203.0.113.9",
      xForwardedFor: "1.2.3.4",
      xRealIp: "9.9.9.9",
      trust: makeTrust("all"),
    });
    expect(result).toBe("9.9.9.9");
  });

  it("returns xRealIp when all XFF trusted and no peer", () => {
    const result = resolveClientIp({
      peerIp: null,
      xForwardedFor: "10.0.0.1,10.0.0.2",
      xRealIp: "203.0.113.9",
      trust: makeTrust("10.0.0.0/8"),
    });
    expect(result).toBe("203.0.113.9");
  });

  it("returns leftmost XFF when peer null, no xRealIp, all XFF trusted", () => {
    const result = resolveClientIp({
      peerIp: null,
      xForwardedFor: "10.0.0.1,10.0.0.2",
      xRealIp: undefined,
      trust: makeTrust("10.0.0.0/8"),
    });
    expect(result).toBe("10.0.0.1");
  });

  it("returns leftmost XFF for loopback-only chain in dev", () => {
    const result = resolveClientIp({
      peerIp: null,
      xForwardedFor: "::1",
      xRealIp: undefined,
      trust: defaultTrust,
    });
    expect(result).toBe("::1");
  });
});
