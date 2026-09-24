import { z } from "@hono/zod-openapi";

/** The vision-input budget of the model the recognition agent currently
 * resolves to. Nullable fields mean "no model-specific constraint" — the
 * client keeps its built-in tiler defaults; any resolution failure surfaces
 * as an error status and the client keeps its current budget too. */
export const recognitionConfigSchema = z.object({
  maxImageEdge: z.number().int().nullable(),
  maxPixelsPerImage: z.number().int().nullable(),
  maxImagesPerRequest: z.number().int().nullable(),
  imageMediaTypes: z.array(z.string()),
});
