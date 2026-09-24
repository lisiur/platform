import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { resolveRecognitionImageConfig } from "../../recognize.service";
import { recognitionConfigSchema } from "./schema";

export const getRecognitionConfigRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiRecognitionConfig",
    method: "get",
    path: "/recognition/config",
    tags: ["QianlaiJournal"],
    summary: "Vision input budget of the pinned recognition model",
    description:
      "Lets the client's screenshot tiler match whatever model the " +
      "qianlai_receipt agent resolves to, so switching models stays a data " +
      "operation. No ledger scope — the budget is a property of the model, " +
      "not of any ledger.",
    request: {},
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        recognitionConfigSchema,
        "Budget fields are null when the model row carries no constraint",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const imageInput = await resolveRecognitionImageConfig({ userId });
    return c.json(
      {
        maxImageEdge: imageInput?.maxImageEdge ?? null,
        maxPixelsPerImage: imageInput?.maxPixelsPerImage ?? null,
        maxImagesPerRequest: imageInput?.maxImagesPerRequest ?? null,
        imageMediaTypes: imageInput?.mediaTypes ?? [],
      },
      200,
    );
  },
});
