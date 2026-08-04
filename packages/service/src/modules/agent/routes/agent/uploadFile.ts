import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import { saveAgentFile } from "#lib/ai-agent/agent-file-store";
import { MAX_UPLOAD_FILE_SIZE } from "#lib/constants";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { agentSessionManager } from "#modules/agent/agent-session.service";
import { sessionIdParamSchema, uploadFileResponseSchema } from "./schema";

export const uploadFileRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "uploadAgentFile",
    method: "post",
    path: "/sessions/{id}/files",
    tags: ["Agent"],
    summary: "Upload a file to an agent session",
    description:
      "Uploads a file to the session's staging area. Returns a fileId that " +
      "can be passed as a body field value to the call_api tool for " +
      "multipart/form-data endpoints.",
    request: {
      params: sessionIdParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.any().openapi({ description: "File to upload" }),
            }),
          },
        },
      },
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(uploadFileResponseSchema, "File uploaded"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const scope = principalScope(principal);
    await assertAccess(
      principal,
      scope === "system" ? "system/agent:chat" : "org/agent:chat",
      scope,
    );
    const userId = getPrincipalUserId(principal);
    const { id } = c.req.valid("param");

    await agentSessionManager.requireSession(id, userId);

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

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      throw new HTTPException(413, { message: "File too large" });
    }

    const meta = await saveAgentFile(id, file);
    return c.json(meta, 200);
  },
});
