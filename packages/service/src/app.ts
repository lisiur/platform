import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { operationLogger } from "#middleware/operation-logger";
import { createRateLimiter } from "#middleware/rate-limit";
import { traceContext } from "#middleware/trace-context";
import {
  initRateLimitDefaults,
  initRateLimitOverrides,
} from "#services/rate-limit.service";
import { jobExecutor } from "#states";
import { routes } from "./routes";

const openAPIApp = new OpenAPIHono().basePath("/api");

openAPIApp.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ code: err.status, message: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ code: 500, message: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err) }, 500);
});

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
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 300),
  windowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ?? 60_000),
  enabled: rateLimitEnabled,
});
const authLimiter = createRateLimiter({
  name: "auth",
  max: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10),
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 60_000),
  enabled: rateLimitEnabled,
});

openAPIApp.use("*", globalLimiter);
openAPIApp.use("/auth/sign-in/email", authLimiter);
openAPIApp.use("/auth/sign-up/email", authLimiter);
openAPIApp.use("/auth/sign-in/wechat", authLimiter);
openAPIApp.use("/auth/change-password", authLimiter);

const app = openAPIApp
  .route("/", routes)
  .get("/", (c) => c.json({ message: "Hello world!" }))
  .get(
    "/docs",
    Scalar({
      sources: [{ url: "/api/openapi.json", title: "Main" }],
    }),
  );

openAPIApp.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Next101 API",
    version: "1.0.0",
    description: "Hono REST API with OpenAPI support",
  },
  servers: [{ url: "/api" }],
});

jobExecutor.start();
initRateLimitDefaults().catch((e) =>
  console.error("Failed to load rate-limit defaults:", e),
);
initRateLimitOverrides().catch((e) =>
  console.error("Failed to load rate-limit overrides:", e),
);

export { app };
