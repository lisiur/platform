import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, type LanguageModel } from "ai";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { CollectionItemType } from "#generated/prisma/client";
import {
  isAgentConfigured,
  loadAiAgentConfig,
} from "#modules/agent/agent-config.service";
import { collectionRepository } from "./collection.repository";
import { resolveStudybuddyAppId } from "./collection.service";

export type EnrichmentKind =
  | "translation"
  | "etymology"
  | "examples"
  | "synonyms"
  | "grammar"
  | "summary";

export const ALL_ENRICHMENT_KINDS: EnrichmentKind[] = [
  "translation",
  "etymology",
  "examples",
  "synonyms",
  "grammar",
  "summary",
];

type EnrichableType = Exclude<CollectionItemType, "LINK">;

interface EnrichmentDef {
  kind: EnrichmentKind;
  types: EnrichableType[];
  schema: z.ZodType;
  /** Concrete JSON shape embedded in the prompt — DeepSeek's json_object mode
   *  does not accept a schema on the wire, so the model must be told the shape. */
  shapeHint: string;
  build: (source: string) => { system: string; prompt: string };
}

const COMMON_SYSTEM =
  "You are an English-learning assistant for a Chinese-speaking learner. " +
  "All explanatory prose must be in Simplified Chinese. " +
  "You must respond with ONLY a single valid JSON object — no markdown, no " +
  "code fences, no commentary before or after.";

const DEFS: EnrichmentDef[] = [
  {
    kind: "translation",
    types: ["WORD", "PHRASE", "SENTENCE"],
    schema: z.object({
      translation: z
        .string()
        .describe("Accurate Simplified-Chinese translation"),
      pronunciation: z
        .string()
        .optional()
        .describe("IPA pronunciation, e.g. /ɪˈfemərəl/"),
      partOfSpeech: z
        .string()
        .optional()
        .describe("Part of speech (noun, verb, etc.), words only"),
    }),
    shapeHint:
      '{"translation":"中文释义","pronunciation":"/tʃɛk/","partOfSpeech":"noun, verb"}',
    build: (source) => ({
      system: COMMON_SYSTEM,
      prompt: [
        `Translate the following English into Simplified Chinese.`,
        ``,
        `The "pronunciation" field MUST be the IPA transcription of the ENGLISH source word itself (for example, "check" → /tʃɛk/, "ephemeral" → /ɪˈfemərəl/).`,
        `Do NOT transcribe the Chinese translation — no pinyin, no tone marks, no Chinese phonetics.`,
        `The "partOfSpeech" field is the grammatical class of the ENGLISH word (e.g. "noun", "verb", "noun, verb").`,
        ``,
        `English: ${source}`,
      ].join("\n"),
    }),
  },
  {
    kind: "etymology",
    types: ["WORD"],
    schema: z.object({
      origin: z
        .string()
        .describe("Etymology and word origin, in Simplified Chinese"),
    }),
    shapeHint: '{"origin":"词源说明（简体中文）"}',
    build: (source) => ({
      system: COMMON_SYSTEM,
      prompt: `Explain the etymology and origin of the English word "${source}" in Simplified Chinese. Cover its roots, how it evolved, and any interesting history.`,
    }),
  },
  {
    kind: "examples",
    types: ["WORD", "PHRASE"],
    schema: z.object({
      sentences: z
        .array(
          z.object({
            en: z.string().describe("An English example sentence"),
            zh: z.string().describe("Chinese translation of the sentence"),
          }),
        )
        .min(2)
        .max(3)
        .describe("2 to 3 example sentences"),
    }),
    shapeHint:
      '{"sentences":[{"en":"English example","zh":"中文翻译"},{"en":"...","zh":"..."}]}',
    build: (source) => ({
      system: COMMON_SYSTEM,
      prompt: `Write 3 natural example sentences using the English "${source}", each with a Simplified-Chinese translation.`,
    }),
  },
  {
    kind: "synonyms",
    types: ["WORD"],
    schema: z.object({
      synonyms: z
        .array(z.string())
        .describe("Closely related synonyms in English"),
      antonyms: z.array(z.string()).describe("Antonyms in English"),
    }),
    shapeHint: '{"synonyms":["word1","word2"],"antonyms":["word3"]}',
    build: (source) => ({
      system: COMMON_SYSTEM,
      prompt: `List common synonyms and antonyms for the English word "${source}". Provide a brief Chinese gloss is not required — English words only.`,
    }),
  },
  {
    kind: "grammar",
    types: ["SENTENCE"],
    schema: z.object({
      breakdown: z
        .string()
        .describe(
          "A Simplified-Chinese grammatical breakdown of the sentence structure",
        ),
      keyPoints: z
        .array(z.string())
        .describe(
          "Key grammar points illustrated by the sentence, in Simplified Chinese",
        ),
    }),
    shapeHint:
      '{"breakdown":"整体语法结构说明（简体中文）","keyPoints":["要点一","要点二"]}',
    build: (source) => ({
      system: COMMON_SYSTEM,
      prompt: `Analyze the grammar of this English sentence for a Chinese learner. Break down the structure and highlight key grammar points.\n\nSentence: ${source}`,
    }),
  },
  {
    kind: "summary",
    types: ["ARTICLE"],
    schema: z.object({
      summary: z
        .string()
        .describe("A concise Simplified-Chinese summary of the article"),
      keyVocabulary: z
        .array(
          z.object({
            word: z.string().describe("An English word or phrase"),
            meaning: z
              .string()
              .describe("Simplified-Chinese meaning in context"),
          }),
        )
        .describe("Important vocabulary worth learning"),
    }),
    shapeHint:
      '{"summary":"文章摘要（简体中文）","keyVocabulary":[{"word":"term","meaning":"释义"}]}',
    build: (source) => ({
      system: COMMON_SYSTEM,
      prompt: `Summarize the following English article in Simplified Chinese, and extract key vocabulary worth learning.\n\nArticle:\n${source}`,
    }),
  },
];

function kindsForType(type: CollectionItemType): EnrichmentKind[] {
  return DEFS.filter((d) => (d.types as string[]).includes(type)).map(
    (d) => d.kind,
  );
}

let cachedAppId: string | null = null;
async function getAppId(): Promise<string> {
  if (!cachedAppId) cachedAppId = await resolveStudybuddyAppId();
  return cachedAppId;
}

export async function enrichItem(
  ownerId: string,
  itemId: string,
  requested?: EnrichmentKind[],
): Promise<{
  itemId: string;
  generated: EnrichmentKind[];
}> {
  const item = await collectionRepository.findOwnedByIdLean(ownerId, itemId);
  if (!item) {
    throw new HTTPException(404, { message: "Collection item not found" });
  }
  if (item.type === "LINK") {
    throw new HTTPException(400, {
      message: "Link items do not support AI enrichment",
    });
  }

  const applicable = kindsForType(item.type);
  const targets: EnrichmentKind[] = requested
    ? requested.filter((k) => applicable.includes(k))
    : applicable;

  if (targets.length === 0) {
    return { itemId, generated: [] };
  }

  const config = await loadAiAgentConfig(await getAppId());
  if (!isAgentConfigured(config)) {
    throw new HTTPException(503, {
      message: "AI enrichment is not configured for this application",
    });
  }

  const provider = createOpenAICompatible({
    name: "studybuddy-enrich",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
  const model = provider(config.model) as LanguageModel;

  const generated: EnrichmentKind[] = [];
  for (const kind of targets) {
    const def = DEFS.find((d) => d.kind === kind);
    if (!def) continue;
    const { system, prompt } = def.build(item.source);
    const fullPrompt =
      `${prompt}\n\nReturn ONLY a JSON object matching this shape ` +
      `(omit a key if not applicable):\n${def.shapeHint}`;
    try {
      const { object } = await generateObject({
        model,
        system,
        prompt: fullPrompt,
        schema: def.schema,
      });
      await collectionRepository.upsertEnrichment({
        itemId: item.id,
        kind,
        content: object as Record<string, unknown>,
        model: config.model,
      });
      generated.push(kind);
    } catch (err) {
      throw new HTTPException(502, {
        message: `AI enrichment failed for "${kind}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }

  return { itemId, generated };
}
