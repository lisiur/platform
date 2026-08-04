import { OpenAPIHono } from "@hono/zod-openapi";
import { createJob } from "./create-job";
import { deleteJob } from "./delete-job";
import { getJob } from "./get-job";
import { getJobStats } from "./get-job-stats";
import { listJobs } from "./list-jobs";
import { triggerJob } from "./trigger-job";
import { updateJob } from "./update-job";

const jobRoutes = new OpenAPIHono();

const routes = jobRoutes.openapiRoutes([
  createJob,
  listJobs,
  getJobStats,
  getJob,
  updateJob,
  deleteJob,
  triggerJob,
] as const);

export { routes as jobRoutes };
