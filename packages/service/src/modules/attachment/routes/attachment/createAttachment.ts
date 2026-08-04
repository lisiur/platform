import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { createAttachment as createAttachmentToStorage } from "#modules/attachment/attachment.service";
import { createAttachmentResponseSchema } from "./schema";

export const createAttachment = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAttachment",
    method: "post",
    path: "/",
    tags: ["Attachment"],
    summary: "Create an attachment",
    description:
      "Upload a file and create an attachment with sharded storage and public/private visibility.",
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...okResponseFn(
        createAttachmentResponseSchema,
        "Attachment created successfully",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = await c.req.parseBody();
    const file = body.file;
    const rawVisibility = (body.visibility as string) || "private";
    const bizType = body.bizType as string;
    const bizId = (body.bizId as string) || getPrincipalUserId(principal);

    if (rawVisibility !== "public" && rawVisibility !== "private") {
      throw new HTTPException(400, {
        message: "visibility must be 'public' or 'private'",
      });
    }

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

    const result = await createAttachmentToStorage({
      file,
      visibility: rawVisibility,
      uploaderId: getPrincipalUserId(principal),
      bizType,
      bizId,
    });

    return c.json(result, 200);
  },
});
