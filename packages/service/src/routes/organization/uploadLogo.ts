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
import { orgScope } from "#lib/scope";
import { uploadOrganizationLogo } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
import { organizationIdParamSchema } from "./schema";

export const uploadOrganizationLogoResponseSchema = z
  .object({
    url: z.string().openapi({ example: "/api/attachment/clx1234567890" }),
    attachmentId: z.string().openapi({ example: "clx1234567890" }),
  })
  .openapi("UploadOrganizationLogoResponse");

const uploadLogoBodySchema = z.object({
  file: z.any().openapi({ description: "Logo image file" }),
});

export const uploadOrganizationLogoRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{id}/logo",
    tags: ["Organization"],
    summary: "Upload organization logo",
    description:
      "Upload a logo for an organization. Creates attachment and cleans up old logo.",
    request: {
      params: organizationIdParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: uploadLogoBodySchema,
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
        uploadOrganizationLogoResponseSchema,
        "Logo uploaded successfully",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    await assertAccess(
      principal,
      "org/organization-settings:update",
      orgScope(id),
    );

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

    const result = await uploadOrganizationLogo(
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
