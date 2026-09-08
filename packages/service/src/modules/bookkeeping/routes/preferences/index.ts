import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteLedgerPreferencesRoute } from "./deleteLedgerPreferences";
import { deleteProjectPreferencesRoute } from "./deleteProjectPreferences";
import { deleteUserPreferencesRoute } from "./deleteUserPreferences";
import { getUserPreferencesRoute } from "./getUserPreferences";
import { updateLedgerPreferencesRoute } from "./updateLedgerPreferences";
import { updateProjectPreferencesRoute } from "./updateProjectPreferences";
import { updateUserPreferencesRoute } from "./updateUserPreferences";

const preferenceRoutes = new OpenAPIHono();

const routes = preferenceRoutes.openapiRoutes([
  getUserPreferencesRoute,
  updateUserPreferencesRoute,
  updateLedgerPreferencesRoute,
  updateProjectPreferencesRoute,
  deleteUserPreferencesRoute,
  deleteLedgerPreferencesRoute,
  deleteProjectPreferencesRoute,
] as const);

export { routes as qianlaiPreferenceRoutes };
