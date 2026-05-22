import { OpenAPIHono } from "@hono/zod-openapi";
import { createOrganization } from "./createOrganization";
import { deleteOrganization } from "./deleteOrganization";
import { getOrganization } from "./getOrganization";
import { listOrganizations } from "./listOrganizations";
import { updateOrganization } from "./updateOrganization";

const organizationRoutes = new OpenAPIHono();

const routes = organizationRoutes.openapiRoutes([
  listOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
] as const);

export { routes as organizationRoutes };
