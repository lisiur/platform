import { OpenAPIHono } from "@hono/zod-openapi";
import { createEntryRoute } from "./createEntry";
import { deleteEntryRoute } from "./deleteEntry";
import { getEntryRoute } from "./getEntry";
import { listEntriesRoute } from "./listEntries";
import { recognizeScreenshotRoute } from "./recognizeScreenshot";
import { updateEntryRoute } from "./updateEntry";
import { uploadEntryAttachmentRoute } from "./uploadEntryAttachment";

const journalEntryRoutes = new OpenAPIHono();

const routes = journalEntryRoutes.openapiRoutes([
  listEntriesRoute,
  getEntryRoute,
  createEntryRoute,
  updateEntryRoute,
  deleteEntryRoute,
  recognizeScreenshotRoute,
  uploadEntryAttachmentRoute,
] as const);

export { routes as qianlaiJournalEntryRoutes };
