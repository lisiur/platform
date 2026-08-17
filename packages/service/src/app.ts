import { OpenAPIHono } from "@hono/zod-openapi";
import { APP_VERSION } from "@repo/shared";
import { Scalar } from "@scalar/hono-api-reference";
import { contextStorage } from "hono/context-storage";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import {
  MAX_JSON_BODY_SIZE,
  MAX_UPLOAD_BODY_SIZE,
  RATE_LIMIT_AUTH_DEFAULT_MAX,
  RATE_LIMIT_AUTH_DEFAULT_WINDOW_MS,
  RATE_LIMIT_GLOBAL_DEFAULT_MAX,
  RATE_LIMIT_GLOBAL_DEFAULT_WINDOW_MS,
} from "#lib/constants";
import { prisma } from "#lib/db";
import { serializeHTTPException } from "#lib/http-error";
import { bodyLimit } from "#middleware/body-limit";
import { operationLogger } from "#middleware/operation-logger";
import { createRateLimiter } from "#middleware/rate-limit";
import { traceContext } from "#middleware/trace-context";
import { loadAuthDefaults } from "#modules/identity/auth-config.service";
import { jobExecutor, jobTemplateService } from "#modules/jobs/public";
import {
  initRateLimitDefaults,
  initRateLimitOverrides,
} from "#modules/system/rate-limit.service";
import { resumeUpdateStatusStream } from "#modules/system/updater-client";
import { routes } from "./modules";
import { seed } from "./seed";

// Hard contract: NODE_ENV must be set explicitly. The CORS policy and many
// libraries (incl. Next.js, which hosts this service) branch on it; a missing
// value silently degrades security (the dev branch reflects any origin with
// credentials). Fail loud at boot instead of guessing.
const nodeEnv = process.env.NODE_ENV;
if (
  nodeEnv !== "production" &&
  nodeEnv !== "development" &&
  nodeEnv !== "test"
) {
  console.error(
    `Refusing to start: NODE_ENV must be one of "production" | "development" | "test" (got ${JSON.stringify(nodeEnv)}). Set it explicitly before booting the service.`,
  );
  process.exit(1);
}

// Skip DB-dependent startup during `next build`: the gateway's API route
// value-imports this module, so its evaluation during static generation would
// otherwise fire prisma queries with no DB connection. Runs at runtime
// (gateway prod/dev server, standalone service) where NEXT_PHASE is unset.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  (async () => {
    const adminApp = await prisma.application.findUnique({
      where: { code: "admin" },
    });
    if (!adminApp) {
      console.log("Running seed...");
      await seed();
      console.log("Seed completed.");
    }

    jobExecutor.start();
    jobTemplateService
      .triggerTemplateByName("sync-currency-rates")
      .catch((e) =>
        console.error("Failed to enqueue currency rate sync job:", e),
      );
    resumeUpdateStatusStream().catch((e) =>
      console.error("Failed to resume update status stream:", e),
    );
    await loadAuthDefaults().catch((e) =>
      console.error("Failed to load auth defaults:", e),
    );
    await initRateLimitDefaults().catch((e) =>
      console.error("Failed to load rate-limit defaults:", e),
    );
    await initRateLimitOverrides().catch((e) =>
      console.error("Failed to load rate-limit overrides:", e),
    );
  })().catch((e) => console.error("Startup failed:", e));
}

const openAPIApp = new OpenAPIHono().basePath("/api");

openAPIApp.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(serializeHTTPException(err), err.status);
  }
  console.error("Unhandled error:", err);
  const traceId = c.get("traceId") as string | undefined;
  if (process.env.NODE_ENV === "production") {
    return c.json(
      { code: 500, message: "Internal Server Error", traceId },
      500,
    );
  }
  return c.json(
    {
      code: 500,
      message:
        err instanceof Error
          ? `${err.name}: ${err.message}\n${err.stack}`
          : String(err),
      traceId,
    },
    500,
  );
});

openAPIApp.use("*", contextStorage());
openAPIApp.use("*", logger());
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

openAPIApp.use(
  "*",
  cors(
    allowedOrigins.length > 0
      ? {
          origin: (origin) =>
            origin && allowedOrigins.includes(origin) ? origin : null,
          credentials: true,
        }
      : process.env.NODE_ENV === "production"
        ? { origin: () => null, credentials: true }
        : { origin: (origin) => origin, credentials: true },
  ),
);
openAPIApp.use("*", traceContext);
openAPIApp.use("*", operationLogger);

const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";
const globalLimiter = createRateLimiter({
  name: "global",
  max: Number(
    process.env.RATE_LIMIT_GLOBAL_MAX ?? RATE_LIMIT_GLOBAL_DEFAULT_MAX,
  ),
  windowMs: Number(
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ??
      RATE_LIMIT_GLOBAL_DEFAULT_WINDOW_MS,
  ),
  enabled: rateLimitEnabled,
});
const authLimiter = createRateLimiter({
  name: "auth",
  max: Number(process.env.RATE_LIMIT_AUTH_MAX ?? RATE_LIMIT_AUTH_DEFAULT_MAX),
  windowMs: Number(
    process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? RATE_LIMIT_AUTH_DEFAULT_WINDOW_MS,
  ),
  enabled: rateLimitEnabled,
});

openAPIApp.use("*", globalLimiter);
openAPIApp.use("/auth/sign-in/email", authLimiter);
openAPIApp.use("/auth/sign-up/email", authLimiter);
openAPIApp.use("/auth/sign-in/wechat", authLimiter);
openAPIApp.use("/auth/change-password", authLimiter);
openAPIApp.use("/auth/webauthn/login-options", authLimiter);
openAPIApp.use("/auth/webauthn/login-verify", authLimiter);

openAPIApp.use("*", async (c, next) => {
  const contentType = c.req.raw.headers.get("content-type") ?? "";
  const maxSize = contentType.includes("multipart/form-data")
    ? MAX_UPLOAD_BODY_SIZE
    : MAX_JSON_BODY_SIZE;
  return bodyLimit({ maxSize })(c, next);
});

const app = openAPIApp
  .route("/", routes)
  .get("/", (c) => c.json({ message: "Hello world!" }))
  .get(
    "/docs",
    Scalar({
      sources: [{ url: "/api/openapi.json", title: "Main" }],
    }),
  );

const openApiDocConfig = {
  openapi: "3.0.0" as const,
  info: {
    title: "Platform API",
    version: APP_VERSION.replace(/^v/, ""),
    description: "Hono REST API with OpenAPI support",
  },
  servers: [{ url: "/" }],
};

openAPIApp.doc("/openapi.json", openApiDocConfig);

export { app };
