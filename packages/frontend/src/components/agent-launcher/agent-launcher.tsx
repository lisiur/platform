"use client";

import {
  Button,
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo/ui";
import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AgentPanel, type AgentPanelProps } from "./agent-panel";

export type AgentLauncherProps = Omit<AgentPanelProps, "className">;

/**
 * Floating AI Agent launcher: a fixed action button that opens a right-side
 * Sheet containing {@link AgentPanel}. Sessions load lazily — the Base UI
 * Dialog portal does not keep its content mounted while closed, so the panel
 * (and its session fetch / SSE subscription) only mounts when the sheet opens.
 *
 * For a non-floating embedding (e.g. a full page), render {@link AgentPanel}
 * directly instead of this launcher.
 */
export function AgentLauncher(props: AgentLauncherProps) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-40 rounded-full shadow-lg",
          open && "pointer-events-none opacity-0",
        )}
        aria-label={t("title")}
      >
        <Bot className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-full data-[side=right]:sm:max-w-[90vw]"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="size-5" />
              {t("title")}
            </SheetTitle>
          </SheetHeader>
          <AgentPanel {...props} className="flex-1" />
        </SheetContent>
      </Sheet>
    </>
  );
}
