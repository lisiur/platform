import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
} from "../department";
import {
  listOrganizationMembers,
  removeOrganizationMember,
} from "../organization-member";
import { activateOrganization } from "./activateOrganization";
import { createOrganization } from "./createOrganization";
import { deleteOrganization } from "./deleteOrganization";
import { getOrganization } from "./getOrganization";
import { getOrganizationSettings } from "./getSettings";
import { listMyOrganizations } from "./listMyOrganizations";
import { listOrganizations } from "./listOrganizations";
import { registerOrganization } from "./registerOrganization";
import { updateOrganization } from "./updateOrganization";
import { updateOrganizationSettings } from "./updateSettings";

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
  getOrganizationSettings,
  updateOrganizationSettings,
  listDepartments,
  createDepartment,
  getDepartment,
  updateDepartment,
  deleteDepartment,
] as const);

export { routes as organizationRoutes };
