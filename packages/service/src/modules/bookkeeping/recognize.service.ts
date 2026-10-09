import { generateObject, type LanguageModel, type ModelMessage } from "ai";
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
export const QIANLAI_VOICE_AGENT_CODE = "qianlai_voice";

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

const CATEGORY_ALTERNATIVES_RULE =
  "- categoryAlternatives: when two or more entries from the list could fit, keep the best in categoryName and put up to 3 runner-up paths here (verbatim from the same kind list, excluding categoryName). [] when unambiguous.";

/** The category lists plus the JSON shape tail — the exact contract the
 * json_object-mode model aligns on. Both input prompts end with this exact
 * block so the two paths can't drift apart. */
function renderCategorySections(categories: {
  expense: string[];
  income: string[];
}): string[] {
  const list = (names: string[]) =>
    names.length > 0 ? names.map((name) => `- ${name}`).join("\n") : "(none)";
  return [
    `Expense categories:\n${list(categories.expense)}`,
    "",
    `Income categories:\n${list(categories.income)}`,
    "",
    "Output JSON shape (fill every key):",
    RECOGNITION_SHAPE_HINT,
  ];
}

export function buildRecognitionPrompt(categories: {
  expense: string[];
  income: string[];
}): string {
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
    CATEGORY_ALTERNATIVES_RULE,
    '- confidence: "high" when the amount and counterparty are both clearly legible; "medium" when the amount is legible but other fields are missing or ambiguous; "low" when the image is blurry, cropped, or the amount itself is hard to read; null when recognized is false.',
    "",
    "Selection rules:",
    "- If several transactions are visible, the largest successful one is primary; the other successful transactions' amounts go to amountAlternatives.",
    "- Failed, cancelled, or pending records are not successful — ignore them.",
    "- If the screenshot shows no successful transaction at all (or is not a payment/transaction screenshot), set recognized to false and every other field to null (arrays []).",
    "- Even in that case you MUST still reply with the JSON object — never plain text, never an explanation.",
    "- Do not guess values not visible in the screenshot — use null.",
    "",
    ...renderCategorySections(categories),
  ].join("\n");
}

type ResolvedRecognitionAgent = Awaited<ReturnType<typeof resolveAgentModel>>;

/**
 * The pipeline both recognition inputs share: billing → agent resolution →
 * optional model-driven guards → category listing → one generateObject call
 * under `executeTrackedAiCall` (usage event, credit reserve → settle,
 * account concurrency slot) → schema parse. Billing failures (402) and
 * other HTTPExceptions propagate untouched, everything else becomes a 502
 * labelled with the caller's input type.
 */
async function runRecognitionAgent(params: {
  userId: string;
  ledgerId: string;
  agentCode: string;
  /** Key omitted entirely for text-only agents — admin can pin any model. */
  requireCapability?: string;
  buildPrompt: (categories: { expense: string[]; income: string[] }) => string;
  messages: (prompt: string) => ModelMessage[];
  failureLabel: string;
  guardModel?: (resolved: ResolvedRecognitionAgent) => void;
}): Promise<ScreenshotRecognition> {
  const billing = await resolveBilling(
    BILLING_RESOURCE_AI_AGENT,
    params.agentCode,
  );

  const resolved = await resolveAgentModel({
    agentCode: params.agentCode,
    subAgent: SUB_AGENT,
    principal: { type: "user", id: params.userId },
    ...(params.requireCapability
      ? { requireCapability: params.requireCapability }
      : {}),
  });
  params.guardModel?.(resolved);

  const categories = await accountRepository.listRecognitionCategoryPaths(
    params.ledgerId,
  );
  const system = resolved.agent.systemPrompt ?? undefined;
  const prompt = params.buildPrompt(categories);
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
          messages: params.messages(prompt),
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
      message: `${params.failureLabel} recognition failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }
}

/**
 * Model-driven guards for the screenshot path: tile count and media types
 * against the resolved vision budget (the route's static multipart
 * whitelist is only the structural layer; the model row may narrow
 * further). An empty mediaTypes list means "no narrowing".
 */
function assertScreenshotImageBudget(
  resolved: ResolvedRecognitionAgent,
  tiles: RecognitionTile[],
): void {
  const imageInput = resolved.imageInput;
  if (!imageInput) return;
  if (
    imageInput.maxImagesPerRequest !== null &&
    tiles.length > imageInput.maxImagesPerRequest
  ) {
    throw new HTTPException(400, {
      message: `Too many screenshot tiles: ${tiles.length} uploaded, ${resolved.endpoint.modelId} accepts at most ${imageInput.maxImagesPerRequest} per request`,
    });
  }
  if (imageInput.mediaTypes.length > 0) {
    const allowed = new Set(imageInput.mediaTypes);
    const offending = tiles.find((tile) => !allowed.has(tile.mediaType));
    if (offending) {
      throw new HTTPException(415, {
        message: `Image type ${offending.mediaType} is not accepted by ${resolved.endpoint.modelId}`,
      });
    }
  }
}

/**
 * Single-shot vision recognition of a payment screenshot into a draft entry
 * payload — the shared pipeline plus the vision specifics: the capability
 * gate, the model-driven image-budget guards, tile file parts.
 */
export async function recognizeScreenshot(params: {
  userId: string;
  ledgerId: string;
  tiles: RecognitionTile[];
}): Promise<ScreenshotRecognition> {
  return runRecognitionAgent({
    userId: params.userId,
    ledgerId: params.ledgerId,
    agentCode: QIANLAI_RECEIPT_AGENT_CODE,
    requireCapability: REQUIRED_CAPABILITY,
    failureLabel: "Screenshot",
    guardModel: (resolved) =>
      assertScreenshotImageBudget(resolved, params.tiles),
    buildPrompt: buildRecognitionPrompt,
    messages: (prompt) => [
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
  });
}

/**
 * The voice path shares the screenshot contract on purpose: the client maps
 * either result through the same seeding layer, so a spoken "昨天打车 23 块"
 * lands in the quick-entry form exactly like a recognized screenshot. The
 * one visible difference: a demoted extra transaction surfaces only through
 * its amounts in amountAlternatives — never merged into the primary entry.
 */
export type VoiceRecognition = ScreenshotRecognition;

export function buildVoiceRecognitionPrompt(
  categories: { expense: string[]; income: string[] },
  now: string,
): string {
  return [
    "The transcript below is the user speaking ONE transaction out loud, in natural speech (usually Chinese). Extract that transaction.",
    `Current local time (the anchor for every relative expression): ${now} — format "YYYY-MM-DDTHH:mm:ss", local, no timezone offset.`,
    "",
    "Field rules:",
    '- kind: "expense" when money leaves the user (花了/买了/吃了/付了/充值), "income" when money arrives (收到/进账/红包/工资/报销/退款). When the user says no direction at all, assume "expense" — bookkeeping utterances are spendings by default.',
    "- amount: the spoken amount as a positive number, no currency symbols. Interpret colloquial quantities: 三十五块 → 35, 两块五 → 2.5, 一百二 → 120, 一千零五十 → 1050, 五十六点五 → 56.5.",
    '- amountAlternatives: other amounts the user spoke that could plausibly be THE amount instead — a pre-discount price, an explicit correction ("不对,是 53"), or the amount of a transaction demoted by the selection rules. Exclude the primary amount, deduplicate, keep speech order, at most 4. Return [] when unambiguous.',
    '- occurredAt: resolve relative day/time expressions against the anchor time above — 今天, 昨天, 前天, 上周三, 上个月 15 号, 大前天早上, 12 号. A spoken clock time (下午 3 点, 15:30, 中午) sets the time; a vague period maps to a representative time: 凌晨 → 01:00, 早上 → 08:00, 中午 → 12:00, 下午 → 15:00, 晚上 → 19:00. No day mentioned at all, or today with no time → null (the client keeps the current moment). Any other day with no time → that date at 00:00:00. Output ISO 8601 "YYYY-MM-DDTHH:mm:ss" without timezone offset.',
    "- merchant: the place or counterparty if spoken (在盒马, 星巴克, 滴滴) — the bare name without prepositions and without what was bought; null if absent.",
    "- memo: what the spending/income was for, verbatim and trimmed (午饭, 打车, 电影票, 工资); null if absent.",
    '- categoryName: copy exactly one entry from the category list matching kind below, verbatim. Entries are "/"-joined paths from the top-level parent to the leaf category (e.g. "food/meals"), written in stable identifiers — built-in categories appear as their internal English code, user-created ones as their current name — so match by meaning, not by language (吃饭/午饭/下馆子 → food; 打车/加油 → transport; 工资 → income salary; and so on). The LAST segment is the actual category, so always answer the full path — never a bare leaf name, never a parent alone. If nothing fits or the user named nothing, null.',
    CATEGORY_ALTERNATIVES_RULE,
    '- confidence: "high" when the amount and what-it-was-for are both clearly stated; "medium" when the amount is clear but other fields are missing or vague; "low" when the transcript is fragmented, trailing off, or the amount itself is ambiguous; null when recognized is false.',
    "",
    "Selection rules:",
    "- Exactly one transaction. If the user described several, keep the most complete one as THE transaction and never merge them — the demoted transactions' amounts go to amountAlternatives so nothing is silently lost.",
    "- Moving money between the user's own accounts (转账, 从招行转到余额宝) is NOT a recordable transaction here: set recognized to false and every other field to null (arrays []).",
    "- If the transcript contains no transaction at all (gibberish, a question, small talk, or no amount can be recovered), set recognized to false and every other field to null (arrays []).",
    "- Even in that case you MUST still reply with the JSON object — never plain text, never an explanation.",
    "- Do not invent details the user did not say — use null.",
    "",
    ...renderCategorySections(categories),
  ].join("\n");
}

/**
 * Single-shot text recognition of a spoken transaction description (the
 * transcript of the client-side on-device speech pass) into a draft entry
 * payload, on the shared pipeline. No capability key is passed on purpose:
 * the voice agent can be pinned to a cheap text model in admin without a
 * code change.
 */
export async function recognizeVoice(params: {
  userId: string;
  ledgerId: string;
  transcript: string;
  now: string;
}): Promise<VoiceRecognition> {
  return runRecognitionAgent({
    userId: params.userId,
    ledgerId: params.ledgerId,
    agentCode: QIANLAI_VOICE_AGENT_CODE,
    failureLabel: "Voice",
    buildPrompt: (categories) =>
      buildVoiceRecognitionPrompt(categories, params.now),
    messages: (prompt) => [
      { role: "user", content: [{ type: "text", text: prompt }] },
    ],
  });
}
