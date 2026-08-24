"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";
import {
  AccountForm,
  type AccountFormInput,
  type AccountFormRef,
  buildMeta,
} from "./account-form";
import type { AccountRow } from "./accounts-table";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  parent?: AccountRow;
}

/** Create dialog (top-level or child); editing happens in the detail panel. */
export function AccountDialog({
  open,
  onOpenChange,
  ledgerId,
  parent,
}: AccountDialogProps) {
  const t = useTranslations("Accounts");
  const queryClient = useQueryClient();
  const formRef = useRef<AccountFormRef>(null);
  const [formKey, setFormKey] = useState(0);
  const [creating, setCreating] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  }

  async function handleCreate() {
    if (!formRef.current) return;
    let data: AccountFormInput;
    try {
      data = await formRef.current.validate();
    } catch {
      return;
    }
    setCreating(true);
    try {
      const meta = buildMeta(data.metaEntries);
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].accounts.$post,
      )({
        param: { ledgerId },
        json: {
          name: data.name,
          type: data.type,
          parentId: parent?.id ?? null,
          icon: data.icon.trim() || null,
          ...(meta ? { meta } : {}),
        },
      });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "accounts", ledgerId],
      });
      toast.success(t("createSuccess"));
      onOpenChange(false);
    } catch {
      // handled by withApiFeedback
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parent ? t("createChild") : t("create")}</DialogTitle>
          <DialogDescription>
            {parent
              ? t("createChildDescription", { name: parent.name })
              : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <AccountForm
            key={formKey}
            ref={formRef}
            defaultValues={{
              name: "",
              type: parent?.type ?? "asset",
              icon: "",
              metaEntries: [],
            }}
            typeDisabled={!!parent}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
