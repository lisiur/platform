import { generateObject, type LanguageModel } from "ai";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  buildDisableThinkingOptions,
  createProviderModel,
} from "#lib/ai-agent/provider-adapter";
import { resolveAgentModel } from "#modules/agent/agent-resolution.service";
import { executeTrackedAiCall } from "#modules/agent/tracked-ai-call";
import {
  BILLING_RESOURCE_AI_AGENT,
  resolveBilling,
} from "#modules/billing/billing.service";
import { accountRepository } from "./account.repository";

export const QIANLAI_RECEIPT_AGENT_CODE = "qianlai_receipt";

const SUB_AGENT = "default";
const REQUIRED_CAPABILITY = "vision";

/**
 * The one-transaction extraction contract, mirrored 1:1 in the user prompt's
 * shape hint — DeepSeek's json_object mode does not accept a schema on the
 * wire, so the model aligns on the embedded shape (see enrich.service.ts).
 */
export const screenshotRecognitionSchema = z.object({
  recognized: z
    .boolean()
    .describe("true only when a successful transaction is visible"),
  kind: z.enum(["expense", "income"]).nullable().describe("money direction"),
  amount: z
    .number()
    .positive()
    .nullable()
    .describe("primary amount — best single interpretation"),
  amountAlternatives: z
    .array(z.number().positive())
    .max(4)
    .default([])
    .describe(
      "other plausible amounts visible, excluding amount, deduplicated, display order",
    ),
  occurredAt: z
    .string()
    .nullable()
    .describe("ISO 8601 local time, no timezone offset"),
  merchant: z.string().nullable().describe("counterparty name, verbatim"),
  memo: z.string().nullable().describe("item name or note, verbatim"),
  categoryName: z
    .string()
    .nullable()
    .describe(
      'best-fit leaf as its full "/"-joined path from the provided list, verbatim',
    ),
  categoryAlternatives: z
    .array(z.string())
    .max(3)
    .default([])
    .describe(
      "runner-up leaf paths verbatim from the same kind list, excluding categoryName",
    ),
  // Nullable: the no-transaction path nulls every field (the prompt says
  // so explicitly), and a required enum here is what turned "not a receipt"
  // screenshots into schema failures — the model obeyed the prompt and the
  // parse rejected its own contract (prod 502, 2026-09-21).
  confidence: z.enum(["high", "medium", "low"]).nullable(),
});

export type ScreenshotRecognition = z.infer<typeof screenshotRecognitionSchema>;

/**
 * The vision-input budget the recognition agent currently resolves to —
 * what GET /bookkeeping/recognition/config hands the client so its tiler
 * can match the pinned model. Throws like `resolveAgentModel` (403/503/…);
 * clients treat any failure as "keep built-in defaults".
 */
export async function resolveRecognitionImageConfig(params: {
  userId: string;
}) {
  const resolved = await resolveAgentModel({
    agentCode: QIANLAI_RECEIPT_AGENT_CODE,
    subAgent: SUB_AGENT,
    principal: { type: "user", id: params.userId },
    requireCapability: REQUIRED_CAPABILITY,
  });
  return resolved.imageInput;
}

export interface RecognitionTile {
  data: Buffer;
  mediaType: string;
}

const RECOGNITION_SHAPE_HINT =
  '{"recognized":true,"kind":"expense","amount":0,"amountAlternatives":[],"occurredAt":"YYYY-MM-DDTHH:mm:ss","merchant":"","memo":"","categoryName":"food/meals","categoryAlternatives":[],"confidence":"high"}';

export function buildRecognitionPrompt(categories: {
  expense: string[];
  income: string[];
}): string {
  const list = (names: string[]) =>
    names.length > 0 ? names.map((name) => `- ${name}`).join("\n") : "(none)";
  return [
    "The attached images are consecutive vertical tiles (top to bottom, slight overlap) of one long screenshot — treat them as one single document.",
    "Extract one transaction from it.",
    "",
    "Field rules:",
    '- kind: "expense" when money leaves the user (payment, transfer out, red packet sent), "income" when money arrives (collection, transfer in, red packet received).',
    "- amount: the final settled amount as a positive number — no currency symbols or thousand separators. Use the actually paid/received amount, not the item price, when they differ.",
    "- amountAlternatives: other monetary values in the screenshot that could plausibly be the transaction amount instead — another successful transaction's amount, the pre-discount item total, or the pre-fee amount. Exclude the primary amount, deduplicate, keep display order, at most 4. Return [] when nothing else is plausible.",
    '- occurredAt: the transaction time exactly as shown, ISO 8601 "YYYY-MM-DDTHH:mm:ss" without timezone offset. Date only → "YYYY-MM-DDT00:00:00"; no date visible → null.',
    "- merchant: the counterparty name (商家/收款方/付款方/对方) verbatim; null if absent.",
    "- memo: the item name or note (商品/备注) verbatim, trimmed; null if absent.",
    '- categoryName: copy exactly one entry from the category list matching kind below, verbatim. Entries are "/"-joined paths from the top-level parent to the leaf category (e.g. "food/meals"), written in stable identifiers — built-in categories appear as their internal English code, user-created ones as their current name — so match by meaning, not by language. The LAST segment is the actual category, so always answer the full path — never a bare leaf name, never a parent alone. If nothing fits, null.',
    "- categoryAlternatives: when two or more entries from the list could fit, keep the best in categoryName and put up to 3 runner-up paths here (verbatim from the same kind list, excluding categoryName). [] when unambiguous.",
    '- confidence: "high" when the amount and counterparty are both clearly legible; "medium" when the amount is legible but other fields are missing or ambiguous; "low" when the image is blurry, cropped, or the amount itself is hard to read; null when recognized is false.',
    "",
    "Selection rules:",
    "- If several transactions are visible, the largest successful one is primary; the other successful transactions' amounts go to amountAlternatives.",
    "- Failed, cancelled, or pending records are not successful — ignore them.",
    "- If the screenshot shows no successful transaction at all (or is not a payment/transaction screenshot), set recognized to false and every other field to null (arrays []).",
    "- Even in that case you MUST still reply with the JSON object — never plain text, never an explanation.",
    "- Do not guess values not visible in the screenshot — use null.",
    "",
    `Expense categories:\n${list(categories.expense)}`,
    "",
    `Income categories:\n${list(categories.income)}`,
    "",
    "Output JSON shape (fill every key):",
    RECOGNITION_SHAPE_HINT,
  ].join("\n");
}

/**
 * Single-shot vision recognition of a payment screenshot into a draft entry
 * payload. Metered end-to-end by `executeTrackedAiCall` (usage event, credit
 * reserve → settle, account concurrency slot); billing failures (402) and
 * other HTTPExceptions propagate untouched, everything else becomes a 502.
 */
export async function recognizeScreenshot(params: {
  userId: string;
  ledgerId: string;
  tiles: RecognitionTile[];
}): Promise<ScreenshotRecognition> {
  const billing = await resolveBilling(
    BILLING_RESOURCE_AI_AGENT,
    QIANLAI_RECEIPT_AGENT_CODE,
  );

  const resolved = await resolveAgentModel({
    agentCode: QIANLAI_RECEIPT_AGENT_CODE,
    subAgent: SUB_AGENT,
    principal: { type: "user", id: params.userId },
    requireCapability: REQUIRED_CAPABILITY,
  });

  // Model-driven guards (the route's static multipart whitelist above this
  // is only the structural layer; the model row may narrow further). An
  // empty mediaTypes list means "no narrowing".
  const imageInput = resolved.imageInput;
  if (imageInput) {
    if (
      imageInput.maxImagesPerRequest !== null &&
      params.tiles.length > imageInput.maxImagesPerRequest
    ) {
      throw new HTTPException(400, {
        message: `Too many screenshot tiles: ${params.tiles.length} uploaded, ${resolved.endpoint.modelId} accepts at most ${imageInput.maxImagesPerRequest} per request`,
      });
    }
    if (imageInput.mediaTypes.length > 0) {
      const allowed = new Set(imageInput.mediaTypes);
      const offending = params.tiles.find(
        (tile) => !allowed.has(tile.mediaType),
      );
      if (offending) {
        throw new HTTPException(415, {
          message: `Image type ${offending.mediaType} is not accepted by ${resolved.endpoint.modelId}`,
        });
      }
    }
  }

  const categories = await accountRepository.listRecognitionCategoryPaths(
    params.ledgerId,
  );
  const system = resolved.agent.systemPrompt ?? undefined;
  const prompt = buildRecognitionPrompt(categories);
  const genParams = {
    temperature: resolved.agent.temperature ?? undefined,
    reasoning: resolved.agent.reasoning ?? undefined,
  };

  const langModel = createProviderModel(resolved.endpoint) as LanguageModel;

  try {
    const result = await executeTrackedAiCall({
      userId: params.userId,
      resolved,
      billing,
      input: { systemPrompt: system ?? null, prompt, params: genParams },
      fn: async () => {
        const generated = await generateObject({
          model: langModel,
          system,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                ...params.tiles.map((tile) => ({
                  type: "file" as const,
                  data: tile.data,
                  mediaType: tile.mediaType,
                })),
              ],
            },
          ],
          schema: screenshotRecognitionSchema,
          temperature: genParams.temperature,
          reasoning: genParams.reasoning,
          providerOptions: buildDisableThinkingOptions(
            resolved.endpoint,
            resolved.agent.reasoning,
          ),
        });
        return {
          result: generated,
          output: {
            text: JSON.stringify(generated.object),
            finishReason: generated.finishReason,
          },
        };
      },
    });
    return screenshotRecognitionSchema.parse(result.object);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(502, {
      message: `Screenshot recognition failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }
}
