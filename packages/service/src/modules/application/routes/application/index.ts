import { OpenAPIHono } from "@hono/zod-openapi";
import { allowedApiRoutes } from "../allowed-api";
import { batchUpsertApplicationConfigsRoute } from "../application-config/batchUpsertConfigs";
import { listApplicationConfigsByGroupRoute } from "../application-config/listConfigsByGroup";
import { getApplication } from "./getApplication";
import { getCurrentApplication } from "./getCurrentApplication";
import { listApplications } from "./listApplications";
import { updateApplication } from "./updateApplication";
import { uploadApplicationFaviconRoute } from "./uploadFavicon";
import { uploadApplicationLogoRoute } from "./uploadLogo";

const applicationRoutes = new OpenAPIHono();

const routes = applicationRoutes
  .route("/", allowedApiRoutes)
  .openapiRoutes([
    listApplications,
    getCurrentApplication,
    getApplication,
    updateApplication,
    uploadApplicationLogoRoute,
    uploadApplicationFaviconRoute,
    listApplicationConfigsByGroupRoute,
    batchUpsertApplicationConfigsRoute,
  ] as const);

export { routes as applicationRoutes };
