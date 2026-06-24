import { OpenAPIHono } from "@hono/zod-openapi";
import {
  listOrganizationMembers,
  removeOrganizationMember,
} from "../organization-member";
import { activateOrganization } from "./activateOrganization";
import { createOrganization } from "./createOrganization";
import { deleteOrganization } from "./deleteOrganization";
import { getOrganization } from "./getOrganization";
import { listMyOrganizations } from "./listMyOrganizations";
import { listOrganizations } from "./listOrganizations";
import { registerOrganization } from "./registerOrganization";
import { updateOrganization } from "./updateOrganization";

const organizationRoutes = new OpenAPIHono();

const routes = organizationRoutes.openapiRoutes([
  listOrganizations,
  listMyOrganizations,
  registerOrganization,
  activateOrganization,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listOrganizationMembers,
  removeOrganizationMember,
] as const);

export { routes as organizationRoutes };
