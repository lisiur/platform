import { DEV_AGENT_TOKEN, DEV_SSR_TOKEN } from "@repo/shared";
import type { Context } from "hono";

const DEV_TOKENS: Record<string, string> = {
  SSR_API_TOKEN: DEV_SSR_TOKEN,
  AGENT_API_TOKEN: DEV_AGENT_TOKEN,
};

export function getEnvToken(name: string): string | undefined {
  return (
    process.env[name] ??
    (process.env.NODE_ENV === "development" ? DEV_TOKENS[name] : undefined)
  );
}

export function isInternalRequest(c: Context): boolean {
  const token = c.req.header("x-internal-token");
  if (!token) return false;
  const ssrToken = getEnvToken("SSR_API_TOKEN");
  const agentToken = getEnvToken("AGENT_API_TOKEN");
  return (
    (!!ssrToken && token === ssrToken) || (!!agentToken && token === agentToken)
  );
}

export function resolveRequestSource(c: Context): "agent" | "ssr" | "browser" {
  const token = c.req.header("x-internal-token");
  const agentToken = getEnvToken("AGENT_API_TOKEN");
  const ssrToken = getEnvToken("SSR_API_TOKEN");
  if (token && agentToken && token === agentToken) return "agent";
  if (token && ssrToken && token === ssrToken) return "ssr";
  return "browser";
}
