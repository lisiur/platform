import { generateObject, type LanguageModel } from "ai";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  buildDisableThinkingOptions,
  createProviderModel,
} from "#lib/ai-agent/provider-adapter";
import { prisma } from "#lib/db";
import { resolveAgentModel } from "#modules/agent/agent-resolution.service";
import { executeTrackedAiCall } from "#modules/agent/tracked-ai-call";
import {
  BILLING_RESOURCE_AI_AGENT,
  resolveBilling,
} from "#modules/billing/billing.service";

export const QIANLAI_RECEIPT_AGENT_CODE = "qianlai_receipt";

const SUB_AGENT = "default";
const REQUIRED_CAPABILITY = "vision";
/** Per-kind display-name budget for the prompt; beyond this the model simply
 * sees a truncated list and the client's fuzzy match still catches the rest. */
const MAX_CATEGORY_NAMES_PER_KIND = 100;

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
    .describe("best-fit category, verbatim from the provided list"),
  categoryAlternatives: z
    .array(z.string())
    .max(3)
    .default([])
    .describe(
      "runner-up categories verbatim from the same kind list, excluding categoryName",
    ),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ScreenshotRecognition = z.infer<typeof screenshotRecognitionSchema>;

export interface RecognitionTile {
  data: Buffer;
  mediaType: string;
}

/**
 * Active leaf expense/income category display names for the prompt. Leaves
 * only — a parent's name would double-count its children's spend semantics —
 * and per-kind capped; the client re-matches names against its own tree, so
 * truncation degrades suggestion quality, never correctness.
 */
export async function listLedgerCategoryNames(ledgerId: string): Promise<{
  expense: string[];
  income: string[];
}> {
  const accounts = await prisma.bookAccount.findMany({
    where: {
      ledgerId,
      status: "active",
      type: { in: ["expense", "income"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      sortOrder: true,
      parentId: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const parentIds = new Set(
    accounts.map((account) => account.parentId).filter(Boolean),
  );
  const names = (type: string) =>
    accounts
      .filter(
        (account) =>
          account.type === type &&
          !parentIds.has(account.id) &&
          account.name !== null,
      )
      .map((account) => account.name as string)
      .slice(0, MAX_CATEGORY_NAMES_PER_KIND);
  return { expense: names("expense"), income: names("income") };
}

const RECOGNITION_SHAPE_HINT =
  '{"recognized":true,"kind":"expense","amount":0,"amountAlternatives":[],"occurredAt":"YYYY-MM-DDTHH:mm:ss","merchant":"","memo":"","categoryName":"","categoryAlternatives":[],"confidence":"high"}';

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
    "- categoryName: copy exactly one name from the category list matching kind below, verbatim. If nothing fits, null.",
    "- categoryAlternatives: when two or more categories from the list could fit, keep the best in categoryName and put up to 3 runners-up here (verbatim from the same kind list, excluding categoryName). [] when unambiguous.",
    '- confidence: "high" when the amount and counterparty are both clearly legible; "medium" when the amount is legible but other fields are missing or ambiguous; "low" when the image is blurry, cropped, or the amount itself is hard to read.',
    "",
    "Selection rules:",
    "- If several transactions are visible, the largest successful one is primary; the other successful transactions' amounts go to amountAlternatives.",
    "- Failed, cancelled, or pending records are not successful — ignore them.",
    "- If the screenshot shows no successful transaction at all (or is not a payment/transaction screenshot), set recognized to false and every other field to null (arrays []).",
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

  const categories = await listLedgerCategoryNames(params.ledgerId);
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
