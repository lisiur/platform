import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import {
  recognizeVoice,
  screenshotRecognitionSchema,
} from "../../recognize.service";
import { ledgerIdParamSchema } from "./schema";

/**
 * `now` is the client's local wall clock — the anchor the model resolves
 * "昨天早上" against, so it must stay offset-free local time (the same
 * format the recognition result's occurredAt uses), not a server-side Date.
 */
export const recognizeVoiceBodySchema = z.object({
  transcript: z.string().trim().min(1).max(1000),
  now: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
});

export const recognizeVoiceRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "recognizeQianlaiVoice",
    method: "post",
    path: "/ledgers/{ledgerId}/entries/recognize-voice",
    tags: ["QianlaiJournal"],
    summary: "Parse a spoken transaction description into a draft entry",
    description:
      "Takes the transcript of one spoken bookkeeping utterance plus the " +
      "client's local wall clock and extracts a single transaction with AI " +
      "(relative dates resolve against `now`). Returns a draft payload that " +
      "never creates an entry. Billed per call against the user's credit " +
      "balance.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: recognizeVoiceBodySchema },
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
    // Draft-only like the screenshot path — no posting, so no writability
    // assert; guests may dictate entries into their project scope.
    await requireLedgerAccess(userId, ledgerId, "guest");

    const { transcript, now } = c.req.valid("json");
    const recognition = await recognizeVoice({
      userId,
      ledgerId,
      transcript,
      now,
    });
    return c.json(recognition, 200);
  },
});
