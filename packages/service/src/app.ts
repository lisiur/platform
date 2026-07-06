import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { operationLogger } from "#middleware/operation-logger";
import { traceContext } from "#middleware/trace-context";
import { jobQueue } from "./lib/queues/job-queue";
import { jobScheduler } from "./lib/queues/job-scheduler";
import { jobWorker } from "./lib/queues/job-worker";
import { routes } from "./routes";
import { registerJobHandlers } from "./services/job-handlers";

const openAPIApp = new OpenAPIHono().basePath("/api");

openAPIApp.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ code: err.status, message: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ code: 500, message: "Internal Server Error" }, 500);
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

registerJobHandlers();
jobQueue.setProcessor((job) => jobWorker.processJob(job));

jobScheduler.start().catch(console.error);
jobWorker.start().catch(console.error);

export { app };
