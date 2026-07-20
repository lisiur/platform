import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#services/role-permission.service";
import { replaceUpload as replaceUploadFile } from "#services/upload.service";
import { replaceUploadParamSchema, uploadListItemSchema } from "./schema";

export const replaceUploadRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}/replace",
    tags: ["Upload"],
    summary: "Replace an uploaded file",
    description:
      "Overwrite the file content of an existing upload, keeping its id and access URL. Accepts multipart/form-data with a `file` field.",
    request: {
      params: replaceUploadParamSchema,
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(uploadListItemSchema, "Upload replaced successfully"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "upload::replace");

    const { id } = c.req.valid("param");

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

    const updated = await replaceUploadFile({ id, file });

    await logAudit({
      event: "upload.replaced",
      category: "file_management",
      severity: "info",
      c,
    });

    return c.json(updated, 200);
  },
});
