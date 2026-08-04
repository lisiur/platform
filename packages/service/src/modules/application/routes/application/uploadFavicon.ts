import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { uploadApplicationFavicon } from "#modules/application/application.service";
import { applicationIdParamSchema } from "./schema";

export const uploadApplicationFaviconResponseSchema = z
  .object({
    url: z.string().openapi({ example: "/api/attachment/clx1234567890" }),
    attachmentId: z.string().openapi({ example: "clx1234567890" }),
  })
  .openapi("UploadApplicationFaviconResponse");

const uploadFaviconBodySchema = z.object({
  file: z.any().openapi({ description: "Favicon image file" }),
});

export const uploadApplicationFaviconRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "uploadApplicationFavicon",
    method: "post",
    path: "/{id}/favicon",
    tags: ["Application"],
    summary: "Upload application favicon",
    description:
      "Upload a favicon for an application. Creates attachment and cleans up old favicon.",
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: uploadFaviconBodySchema,
          },
        },
      },
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        uploadApplicationFaviconResponseSchema,
        "Favicon uploaded successfully",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    await assertAccess(principal, "system/application:update");

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = c.req.valid("form");
    const file = body.file;

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

    const result = await uploadApplicationFavicon(
      id,
      file,
      getPrincipalUserId(principal),
    );

    return c.json(
      {
        url: result.url,
        attachmentId: result.attachmentId,
      },
      200,
    );
  },
});
