import { OpenAPIHono } from "@hono/zod-openapi";
import { cancelJobInstance } from "./cancel-job-instance";
import { createJobInstance } from "./create-job-instance";
import { getJobInstance } from "./get-job-instance";
import { listJobInstances } from "./list-job-instances";

const jobInstanceRoutes = new OpenAPIHono();

const routes = jobInstanceRoutes.openapiRoutes([
  createJobInstance,
  listJobInstances,
  getJobInstance,
  cancelJobInstance,
] as const);

export { routes as jobInstanceRoutes };
