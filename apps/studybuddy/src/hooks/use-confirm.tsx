"use client";

import { Button } from "@repo/ui";
import type { ReactNode } from "react";
import { useDialog } from "@/hooks/use-dialog";

interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
}

export function useConfirm() {
  const [openDialog] = useDialog<ConfirmOptions, boolean>((opts) => ({
    defaultValue: false,
    title: opts.title,
    description: opts.description,
    footer: (close) => (
      <>
        <Button type="button" variant="outline" onClick={() => close(false)}>
          {opts.cancelLabel ?? "Cancel"}
        </Button>
        <Button
          variant={opts.variant ?? "destructive"}
          onClick={() => close(true)}
        >
          {opts.confirmLabel ?? "Confirm"}
        </Button>
      </>
    ),
  }));

  return openDialog;
}
