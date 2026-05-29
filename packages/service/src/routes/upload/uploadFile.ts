import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { uploadFile as uploadFileToStorage } from "#services/upload.service";
import { errorSchema, uploadResponseSchema } from "./schema";

export const uploadFile = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Upload"],
    summary: "Upload a file",
    description:
      "Upload a file with sharded storage and public/private visibility.",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: uploadResponseSchema,
          },
        },
        description: "File uploaded successfully",
      },
      400: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Invalid file type or size",
      },
      401: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = await c.req.parseBody();
    const file = body.file;
    const rawVisibility = (body.visibility as string) || "private";
    if (rawVisibility !== "public" && rawVisibility !== "private") {
      throw new HTTPException(400, {
        message: "visibility must be 'public' or 'private'",
      });
    }

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided" });
    }

    const result = await uploadFileToStorage({
      file,
      visibility: rawVisibility,
      uploaderId: session.user.id,
    });

    return c.json(result, 200);
  },
});
