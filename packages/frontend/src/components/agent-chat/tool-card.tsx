"use client";

import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@repo/ui";
import { ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";

interface ToolPart {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state?: string;
}

interface ToolCardProps {
  part: ToolPart;
}

function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== "object" || part === null) return false;
  const type = (part as { type?: string }).type ?? "";
  return type.startsWith("tool-") || type === "dynamic-tool";
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Renders a tool-invocation part from an assistant message: the tool name, its
 * input, and the output (or an in-progress indicator while executing).
 */
export function ToolCard({ part }: ToolCardProps) {
  const [open, setOpen] = useState(false);
  // Static tool parts encode their name in `type` as `tool-${NAME}` and carry no
  // `toolName` field; only dynamic tools (`type: "dynamic-tool"`) set `toolName`.
  const name =
    part.toolName ??
    (part.type?.startsWith("tool-") ? part.type.slice("tool-".length) : "tool");
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const hasOutput = part.output !== undefined || part.errorText !== undefined;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-muted/30">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs font-medium">{name}</span>
          {running && !hasOutput ? (
            <Spinner className="ml-auto" />
          ) : (
            <Badge
              variant={part.errorText ? "destructive" : "secondary"}
              className="ml-auto"
            >
              {part.errorText ? "error" : hasOutput ? "done" : "running"}
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t border-border px-3 py-2 text-xs">
            {part.input !== undefined && (
              <div>
                <div className="mb-1 font-medium text-muted-foreground">
                  Input
                </div>
                <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                  {stringify(part.input)}
                </pre>
              </div>
            )}
            {part.errorText !== undefined ? (
              <div>
                <div className="mb-1 font-medium text-destructive">Error</div>
                <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-destructive">
                  {stringify(part.errorText)}
                </pre>
              </div>
            ) : part.output !== undefined ? (
              <div>
                <div className="mb-1 font-medium text-muted-foreground">
                  Output
                </div>
                <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                  {stringify(part.output)}
                </pre>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export type { ToolPart };
export { isToolPart };
