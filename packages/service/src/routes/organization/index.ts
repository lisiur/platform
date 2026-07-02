import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
} from "../department";
import {
  batchUpdateOrganizationMembers,
  listOrganizationMembers,
  removeOrganizationMember,
  setMemberPositions,
  updateOrganizationMember,
} from "../organization-member";
import {
  createPosition,
  deletePosition,
  getPositionPermissions,
  listAvailablePositionPermissions,
  listPositionMembers,
  listPositions,
  setPositionPermissions,
  updatePosition,
} from "../position";
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
  batchUpdateOrganizationMembers,
  removeOrganizationMember,
  updateOrganizationMember,
  setMemberPositions,
  getOrganizationSettings,
  updateOrganizationSettings,
  listDepartments,
  createDepartment,
  getDepartment,
  updateDepartment,
  deleteDepartment,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
  listPositionMembers,
  getPositionPermissions,
  listAvailablePositionPermissions,
  setPositionPermissions,
] as const);

export { routes as organizationRoutes };
