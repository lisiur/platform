import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { prisma } from "@/lib/db";

export const appContext = createMiddleware(async (c, next) => {
  const code = c.req.header("X-App-Code");
  if (!code) {
    throw new HTTPException(400, { message: "Missing X-App-Code header" });
  }
  const app = await prisma.application.findFirst({
    where: { code, deletedAt: null },
  });
  if (!app) {
    throw new HTTPException(404, { message: `Application not found: ${code}` });
  }
  c.set("appId", app.id);
  c.set("currentApp", app);
  await next();
});
