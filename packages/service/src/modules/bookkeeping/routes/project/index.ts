import { OpenAPIHono } from "@hono/zod-openapi";
import { addProjectMemberRoute } from "./addProjectMember";
import { createProjectRoute } from "./createProject";
import { deleteProjectRoute } from "./deleteProject";
import { getProjectRoute } from "./getProject";
import { leaveProjectRoute } from "./leaveProject";
import { listProjectsRoute } from "./listProjects";
import { projectReportRoute } from "./projectReport";
import { removeProjectMemberRoute } from "./removeProjectMember";
import { updateProjectRoute } from "./updateProject";

const projectRoutes = new OpenAPIHono();

const routes = projectRoutes.openapiRoutes([
  listProjectsRoute,
  createProjectRoute,
  getProjectRoute,
  updateProjectRoute,
  deleteProjectRoute,
  addProjectMemberRoute,
  removeProjectMemberRoute,
  leaveProjectRoute,
  projectReportRoute,
] as const);

export { routes as qianlaiProjectRoutes };
