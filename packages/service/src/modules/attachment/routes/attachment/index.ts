import { OpenAPIHono } from "@hono/zod-openapi";
import { createAttachment } from "./createAttachment";
import { deleteAttachmentsRoute } from "./deleteAttachments";
import { getAttachment } from "./getAttachment";
import { listAttachmentsRoute } from "./listAttachments";
import { replaceAttachmentRoute } from "./replaceAttachment";
import { signAttachment } from "./signAttachment";

const attachmentRoutes = new OpenAPIHono();

const routes = attachmentRoutes.openapiRoutes([
  listAttachmentsRoute,
  createAttachment,
  getAttachment,
  signAttachment,
  replaceAttachmentRoute,
  deleteAttachmentsRoute,
] as const);

export { routes as attachmentRoutes };
