"use client";

import { ComarkClient, ComarkRenderer } from "@comark/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@repo/ui";
import { parse } from "comark";
import { Brain, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { splitReasoning } from "./split-reasoning";

interface AgentMarkdownProps {
  content: string;
  streaming?: boolean;
}

/**
 * Streaming: delegates to `ComarkClient` which uses `useDeferredValue` to
 * keep showing the previous parsed content while new tokens are being parsed.
 *
 * Static (history): shows raw text instantly, then calls `parse()` in a
 * `useEffect` and swaps to `ComarkRenderer` once the tree is ready. This
 * avoids the `ComarkClient` Suspense boundary that renders `null` until the
 * async `parse()` resolves — which causes visible content delay on reload.
 */
export function AgentMarkdown({
  content,
  streaming = false,
}: AgentMarkdownProps) {
  const { thinking, thinkingOpen, answer } = splitReasoning(content);

  if (!thinking && !answer) return null;

  return (
    <div className="space-y-2">
      {thinking && (
        <ReasoningPanel
          thinking={thinking}
          streaming={streaming && thinkingOpen}
        />
      )}
      {answer && (
        <>
          {streaming ? (
            <ComarkClient streaming caret={false}>
              {answer}
            </ComarkClient>
          ) : (
            <StaticAnswer answer={answer} />
          )}
          {streaming && (
            <span
              aria-hidden
              className="ml-1 inline-block h-[1.1em] w-[2px] animate-pulse bg-current align-text-bottom"
            />
          )}
        </>
      )}
    </div>
  );
}

function StaticAnswer({ answer }: { answer: string }) {
  const [tree, setTree] = useState<Awaited<ReturnType<typeof parse>> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    parse(answer).then((t) => {
      if (!cancelled) setTree(t);
    });
    return () => {
      cancelled = true;
    };
  }, [answer]);

  if (!tree) {
    return <div className="whitespace-pre-wrap break-words">{answer}</div>;
  }

  return <ComarkRenderer tree={tree} />;
}

interface ReasoningPanelProps {
  thinking: string;
  streaming: boolean;
}

function ReasoningPanel({ thinking, streaming }: ReasoningPanelProps) {
  const [open, setOpen] = useState(streaming);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-muted/30">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-muted-foreground">Reasoning</span>
          {streaming && <Spinner className="ml-auto h-3 w-3" />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="whitespace-pre-wrap break-words border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {thinking}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
