import { OpenAPIHono } from "@hono/zod-openapi";
import { getRecognitionConfigRoute } from "./getRecognitionConfig";

const recognitionRoutes = new OpenAPIHono();

const routes = recognitionRoutes.openapiRoutes([
  getRecognitionConfigRoute,
] as const);

export { routes as qianlaiRecognitionRoutes };
