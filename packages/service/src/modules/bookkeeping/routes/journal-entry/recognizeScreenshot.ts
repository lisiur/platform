import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { MAX_UPLOAD_FILE_SIZE } from "#lib/constants";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import {
  type RecognitionTile,
  recognizeScreenshot,
  screenshotRecognitionSchema,
} from "../../recognize.service";
import { ledgerIdParamSchema } from "./schema";

/** Vertical tile order is encoded in the field names themselves, so the
 * client never needs a separate ordering field and the model receives the
 * parts in document order. */
const TILE_FIELDS = [
  "file0",
  "file1",
  "file2",
  "file3",
  "file4",
  "file5",
] as const;

const TILE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const recognizeScreenshotFormSchema = z.object({
  file0: z.any().optional().openapi({ description: "Screenshot tile 0 (top)" }),
  file1: z.any().optional().openapi({ description: "Screenshot tile 1" }),
  file2: z.any().optional().openapi({ description: "Screenshot tile 2" }),
  file3: z.any().optional().openapi({ description: "Screenshot tile 3" }),
  file4: z.any().optional().openapi({ description: "Screenshot tile 4" }),
  file5: z
    .any()
    .optional()
    .openapi({ description: "Screenshot tile 5 (bottom)" }),
});

/** Validates the multipart form into ordered tiles; pure apart from the
 * async File reads so the tile rules are unit-testable without HTTP. */
export async function collectRecognitionTiles(
  form: Record<string, unknown>,
): Promise<RecognitionTile[]> {
  const tiles: RecognitionTile[] = [];
  for (const field of TILE_FIELDS) {
    const value = form[field];
    if (value === undefined || value === null) continue;
    if (!(value instanceof File) || value.size === 0) {
      throw new HTTPException(400, { message: `Invalid upload for ${field}` });
    }
    if (value.size > MAX_UPLOAD_FILE_SIZE) {
      throw new HTTPException(413, { message: `File too large: ${field}` });
    }
    if (!TILE_MEDIA_TYPES.has(value.type)) {
      throw new HTTPException(415, {
        message: `Unsupported image type for ${field}: ${value.type || "unknown"} (expected image/jpeg, image/png, or image/webp)`,
      });
    }
    tiles.push({
      data: Buffer.from(await value.arrayBuffer()),
      mediaType: value.type,
    });
  }
  if (tiles.length === 0) {
    throw new HTTPException(400, {
      message: "Provide at least one screenshot tile (file0…file5)",
    });
  }
  return tiles;
}

export const recognizeScreenshotRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "recognizeQianlaiScreenshot",
    method: "post",
    path: "/ledgers/{ledgerId}/entries/recognize-screenshot",
    tags: ["QianlaiJournal"],
    summary: "Recognize a payment screenshot into a draft entry",
    description:
      "Uploads one to six screenshot tiles (vertical order, file0…file5) and " +
      "extracts a single transaction with AI vision. Returns a draft payload " +
      "with primary values plus alternates; it never creates an entry. Billed " +
      "per call against the user's credit balance.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: recognizeScreenshotFormSchema,
          },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        screenshotRecognitionSchema,
        "The extracted draft transaction",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    await requireLedgerAccess(userId, ledgerId, "guest");

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const tiles = await collectRecognitionTiles(c.req.valid("form"));
    const recognition = await recognizeScreenshot({
      userId,
      ledgerId,
      tiles,
    });
    return c.json(recognition, 200);
  },
});
