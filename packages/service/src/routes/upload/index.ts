import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteUploadsRoute } from "./deleteUploads";
import { getFile } from "./getFile";
import { listUploadsRoute } from "./listUploads";
import { replaceUploadRoute } from "./replaceUpload";
import { signFile } from "./signFile";
import { uploadFile } from "./uploadFile";

const uploadRoutes = new OpenAPIHono();

const routes = uploadRoutes.openapiRoutes([
  listUploadsRoute,
  uploadFile,
  getFile,
  signFile,
  replaceUploadRoute,
  deleteUploadsRoute,
] as const);

export { routes as uploadRoutes };
