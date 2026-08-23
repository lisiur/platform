import { OpenAPIHono } from "@hono/zod-openapi";
import { createEntryRoute } from "./createEntry";
import { deleteEntryRoute } from "./deleteEntry";
import { getEntryRoute } from "./getEntry";
import { listEntriesRoute } from "./listEntries";

const journalEntryRoutes = new OpenAPIHono();

const routes = journalEntryRoutes.openapiRoutes([
  listEntriesRoute,
  getEntryRoute,
  createEntryRoute,
  deleteEntryRoute,
] as const);

export { routes as qianlaiJournalEntryRoutes };
