"use client";

import { Badge, Spinner } from "@repo/ui";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/utils/date";

export const ENRICHMENT_KINDS = [
  "translation",
  "etymology",
  "examples",
  "synonyms",
  "grammar",
  "summary",
] as const;
export type EnrichmentKind = (typeof ENRICHMENT_KINDS)[number];

export const KINDS_BY_TYPE: Record<string, EnrichmentKind[]> = {
  WORD: ["translation", "etymology", "examples", "synonyms"],
  PHRASE: ["translation", "examples"],
  SENTENCE: ["translation", "grammar"],
  ARTICLE: ["summary"],
  LINK: [],
};

export interface EnrichmentData {
  id: string;
  kind: string;
  content: Record<string, unknown>;
  model: string;
  generatedAt: string;
}

interface EnrichmentSectionProps {
  kind: EnrichmentKind;
  data: EnrichmentData | null;
  pending?: boolean;
}

function EnrichContent({
  kind,
  content,
}: {
  kind: EnrichmentKind;
  content: Record<string, unknown>;
}) {
  if (kind === "translation") {
    const pronunciation = content.pronunciation
      ? String(content.pronunciation)
      : null;
    const partOfSpeech = content.partOfSpeech
      ? String(content.partOfSpeech)
      : null;
    return (
      <div className="space-y-1">
        <div className="text-lg font-medium">
          {String(content.translation ?? "")}
        </div>
        {(pronunciation || partOfSpeech) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {partOfSpeech && <span>{partOfSpeech}</span>}
            {pronunciation && (
              <span className="font-mono">{pronunciation}</span>
            )}
          </div>
        )}
      </div>
    );
  }
  if (kind === "etymology") {
    return (
      <p className="text-sm leading-relaxed">{String(content.origin ?? "")}</p>
    );
  }
  if (kind === "examples") {
    const sentences = (content.sentences ?? []) as Array<{
      en: string;
      zh: string;
    }>;
    return (
      <ul className="space-y-2">
        {sentences.map((s) => (
          <li key={s.en} className="space-y-0.5">
            <div className="text-sm">{s.en}</div>
            <div className="text-xs text-muted-foreground">{s.zh}</div>
          </li>
        ))}
      </ul>
    );
  }
  if (kind === "synonyms") {
    const syn = (content.synonyms ?? []) as string[];
    const ant = (content.antonyms ?? []) as string[];
    return (
      <div className="space-y-2">
        {syn.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Synonyms:</span>
            {syn.map((w) => (
              <Badge key={w} variant="secondary" className="text-[11px]">
                {w}
              </Badge>
            ))}
          </div>
        )}
        {ant.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Antonyms:</span>
            {ant.map((w) => (
              <Badge key={w} variant="outline" className="text-[11px]">
                {w}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (kind === "grammar") {
    const points = (content.keyPoints ?? []) as string[];
    return (
      <div className="space-y-2">
        <p className="text-sm leading-relaxed">
          {String(content.breakdown ?? "")}
        </p>
        {points.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (kind === "summary") {
    const vocab = (content.keyVocabulary ?? []) as Array<{
      word: string;
      meaning: string;
    }>;
    return (
      <div className="space-y-2">
        <p className="text-sm leading-relaxed">
          {String(content.summary ?? "")}
        </p>
        {vocab.length > 0 && (
          <div className="space-y-1">
            {vocab.map((v) => (
              <div key={v.word} className="text-xs">
                <span className="font-medium">{v.word}</span>
                <span className="text-muted-foreground"> — {v.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function EnrichmentSection({
  kind,
  data,
  pending,
}: EnrichmentSectionProps) {
  const t = useTranslations("Collection");
  const label = t(`enrichments.${kind}`);
  const description = t(`enrichmentDescriptions.${kind}`);

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {data ? (
        <div className="space-y-2">
          <EnrichContent kind={kind} content={data.content} />
          <p className="text-[10px] text-muted-foreground">
            {data.model} · {formatDateTime(data.generatedAt)}
          </p>
        </div>
      ) : pending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          {t("autoEnrichPending")}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("notGenerated")}</p>
      )}
    </section>
  );
}
