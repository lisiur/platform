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
import { useAccountName } from "@/hooks/use-account-name";
import { realAccountsQueryKey } from "@/hooks/use-real-accounts";
import { appClient, withApiFeedback } from "@/lib/api";
import {
  AccountForm,
  type AccountFormInput,
  type AccountFormRef,
  buildMeta,
  NO_REAL_ACCOUNT,
  type RealAccountOption,
} from "./account-form";
import type { AccountRow } from "./accounts-table";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  parent?: AccountRow;
  realAccountOptions?: RealAccountOption[];
}

/** Create dialog (top-level or child); editing happens in the detail panel. */
export function AccountDialog({
  open,
  onOpenChange,
  ledgerId,
  parent,
  realAccountOptions,
}: AccountDialogProps) {
  const t = useTranslations("Accounts");
  const accountName = useAccountName();
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
      // Link right away when the user picked one of their masters; the
      // picker only renders for asset/liability types.
      const linkReal =
        data.realAccountId !== NO_REAL_ACCOUNT &&
        (data.type === "asset" || data.type === "liability")
          ? data.realAccountId
          : undefined;
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
          ...(linkReal ? { realAccountId: linkReal } : {}),
        },
      });
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "accounts", ledgerId],
      });
      if (linkReal) {
        queryClient.invalidateQueries({ queryKey: realAccountsQueryKey });
      }
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
              ? t("createChildDescription", { name: accountName(parent) })
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
              realAccountId: NO_REAL_ACCOUNT,
            }}
            typeDisabled={!!parent}
            realAccountOptions={realAccountOptions}
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
