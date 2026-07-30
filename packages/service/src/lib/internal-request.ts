import type { Context } from "hono";

export function isInternalRequest(c: Context): boolean {
  const token = c.req.header("x-internal-token");
  if (!token) return false;
  return (
    (!!process.env.SSR_API_TOKEN && token === process.env.SSR_API_TOKEN) ||
    (!!process.env.AGENT_API_TOKEN && token === process.env.AGENT_API_TOKEN)
  );
}
