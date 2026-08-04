import ipaddr from "ipaddr.js";

export const DEFAULT_TRUST = "uniqueLocal,loopback,linkLocal";

export type TrustRule =
  | { kind: "ip"; ip: ipaddr.IPv4 | ipaddr.IPv6 }
  | { kind: "cidr"; ip: ipaddr.IPv4 | ipaddr.IPv6; prefixLength: number }
  | {
      kind: "keyword";
      name: "loopback" | "uniqueLocal" | "linkLocal" | "private" | "all";
    };

export type TrustSpec = {
  rules: TrustRule[];
};

function isBuiltinTrusted(
  ip: ipaddr.IPv4 | ipaddr.IPv6,
  spec: TrustSpec,
): boolean {
  if (spec.rules.some((r) => r.kind === "keyword" && r.name === "all"))
    return true;
  return spec.rules.some((r) => {
    if (r.kind === "keyword") {
      return ip.range() === r.name;
    }
    if (r.kind === "ip") {
      if (ip.kind() !== r.ip.kind()) return false;
      return ip.toString() === r.ip.toString();
    }
    if (r.kind === "cidr") {
      try {
        return ip.match(r.ip, r.prefixLength);
      } catch {
        return false;
      }
    }
    return false;
  });
}

export function parseTrust(raw?: string): TrustSpec {
  if (!raw || raw === "none") return { rules: [] };
  if (raw === "all") return { rules: [{ kind: "keyword", name: "all" }] };

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const rules: TrustRule[] = [];

  for (const token of tokens) {
    if (
      token === "loopback" ||
      token === "uniqueLocal" ||
      token === "linkLocal" ||
      token === "private" ||
      token === "all"
    ) {
      rules.push({ kind: "keyword", name: token });
      continue;
    }
    try {
      const [network, pfx] = ipaddr.parseCIDR(token);
      rules.push({ kind: "cidr", ip: network, prefixLength: pfx });
    } catch {
      try {
        const parsed = ipaddr.parse(token);
        rules.push({ kind: "ip", ip: parsed });
      } catch {
        // skip unknown token
      }
    }
  }

  return { rules };
}

export type ResolveArgs = {
  peerIp: string | null;
  xForwardedFor: string | undefined;
  xRealIp: string | undefined;
  trust: TrustSpec;
};

export function resolveClientIp({
  peerIp,
  xForwardedFor,
  xRealIp,
  trust,
}: ResolveArgs): string {
  let normalizedPeer: string | null = null;

  if (peerIp !== null) {
    try {
      const peerAddr = ipaddr.parse(peerIp);
      let checkAddr: ipaddr.IPv4 | ipaddr.IPv6 = peerAddr;

      if (peerAddr.kind() === "ipv6") {
        const ipv6 = peerAddr as ipaddr.IPv6;
        if (ipv6.isIPv4MappedAddress()) {
          checkAddr = ipv6.toIPv4Address();
          normalizedPeer = checkAddr.toString();
        } else {
          normalizedPeer = peerIp;
        }
      } else {
        normalizedPeer = peerIp;
      }

      const peerTrusted = isBuiltinTrusted(checkAddr, trust);
      if (!peerTrusted) {
        return normalizedPeer ?? peerIp ?? "unknown";
      }
    } catch {
      return xRealIp ?? peerIp ?? "unknown";
    }
  }

  // No peer info OR peer is trusted -> walk X-Forwarded-For chain

  const xffList: string[] = (xForwardedFor ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  for (let i = xffList.length - 1; i >= 0; i--) {
    const addr = xffList[i];
    let ip: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      ip = ipaddr.parse(addr);
    } catch {
      continue;
    }

    if (ip.kind() === "ipv6") {
      const ipv6 = ip as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        const v4 = ipv6.toIPv4Address() as ipaddr.IPv4;
        if (!isBuiltinTrusted(v4, trust)) {
          return v4.toString();
        }
        continue;
      }
    }

    if (!isBuiltinTrusted(ip, trust)) {
      return addr;
    }
  }

  return xRealIp ?? xffList[0] ?? normalizedPeer ?? peerIp ?? "unknown";
}
