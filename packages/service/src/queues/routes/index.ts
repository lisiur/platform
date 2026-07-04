import { OpenAPIHono } from "@hono/zod-openapi";
import { enqueueJob } from "./enqueue-job";
import { listJobs } from "./list-jobs";
import { getJob } from "./get-job";
import { retryJob } from "./retry-job";
import { cancelJob } from "./cancel-job";

const jobRoutes = new OpenAPIHono();

const routes = jobRoutes.openapiRoutes([
  enqueueJob,
  listJobs,
  getJob,
  retryJob,
  cancelJob,
] as const);

export { routes as jobRoutes };
