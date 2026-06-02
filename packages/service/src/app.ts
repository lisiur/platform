import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { appContext } from "#middleware/app-context";
import { operationLogger } from "#middleware/operation-logger";
import { traceContext } from "#middleware/trace-context";
import { routes } from "./routes";

const openAPIApp = new OpenAPIHono().basePath("/api");

openAPIApp.use("*", logger());
openAPIApp.use("*", cors());
openAPIApp.use("*", traceContext);
openAPIApp.use("*", appContext);
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

export { app };
