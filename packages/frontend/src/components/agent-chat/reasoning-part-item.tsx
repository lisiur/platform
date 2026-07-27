"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@repo/ui";
import { Brain, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ReasoningPart {
  type: "reasoning";
  text: string;
  state?: "streaming" | "done";
}

interface ReasoningPartItemProps {
  part: ReasoningPart;
}

/**
 * Renders a typed `ReasoningUIPart` (the AI SDK's structured reasoning
 * output, separate from text). Auto-opens while still streaming, and
 * collapses once the model moves on to the answer.
 */
export function ReasoningPartItem({ part }: ReasoningPartItemProps) {
  const streaming = part.state === "streaming";
  const [open, setOpen] = useState(streaming);
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (streaming && !prevStreaming.current) setOpen(true);
    prevStreaming.current = streaming;
  }, [streaming]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="first:mt-2 rounded-md border border-border bg-muted/30">
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
            {part.text}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** Type-guard for an AI SDK `ReasoningUIPart`. */
export function isReasoningPart(part: unknown): part is ReasoningPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === "reasoning"
  );
}
