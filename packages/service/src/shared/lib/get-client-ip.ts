import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { resolveClientIp } from "#lib/client-ip";
import { getTrustSpecSync } from "#modules/system/rate-limit.service";

function getPeerIp(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

export function getClientIpFromContext(c: Context): string {
  return resolveClientIp({
    peerIp: getPeerIp(c),
    xForwardedFor: c.req.header("x-forwarded-for"),
    xRealIp: c.req.header("x-real-ip"),
    trust: getTrustSpecSync(),
  });
}

export function getClientIpFromContextOrNull(c: Context): string | null {
  const ip = getClientIpFromContext(c);
  return ip === "unknown" ? null : ip;
}
