import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import type { Application } from "#modules/application/routes/application/schema";

async function findCurrentApp(c: Context): Promise<Application | null> {
  const code = c.req.header("X-App-Code");
  if (!code) return null;
  return prisma.application.findFirst({
    where: { code },
  });
}

export async function tryCurrentApp(c: Context): Promise<Application | null> {
  return findCurrentApp(c);
}

export async function requireCurrentApp(c: Context): Promise<Application> {
  const code = c.req.header("X-App-Code");
  if (!code) {
    throw new HTTPException(400, { message: "Missing X-App-Code header" });
  }
  const currentApp = await tryCurrentApp(c);
  if (!currentApp) {
    throw new HTTPException(404, {
      message: `Application not found: ${code}`,
    });
  }
  return currentApp;
}

export async function tryAppId(c: Context): Promise<string | null> {
  return (await findCurrentApp(c))?.id ?? null;
}

export async function requireAppId(c: Context): Promise<string> {
  return (await requireCurrentApp(c)).id;
}
