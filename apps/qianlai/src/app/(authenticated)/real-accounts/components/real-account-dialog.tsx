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
import {
  type RealAccountDto,
  realAccountsQueryKey,
} from "@/hooks/use-real-accounts";
import { appClient, withApiFeedback } from "@/lib/api";
import {
  buildMeta,
  RealAccountForm,
  type RealAccountFormInput,
  type RealAccountFormRef,
  realAccountToFormValues,
} from "./real-account-form";

interface RealAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create. */
  realAccount?: RealAccountDto | null;
}

export function RealAccountDialog({
  open,
  onOpenChange,
  realAccount,
}: RealAccountDialogProps) {
  const t = useTranslations("RealAccounts");
  const queryClient = useQueryClient();
  const formRef = useRef<RealAccountFormRef>(null);
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  }

  async function handleSave() {
    if (!formRef.current) return;
    let data: RealAccountFormInput;
    try {
      data = await formRef.current.validate();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const meta = buildMeta(data.metaEntries);
      const body = {
        name: data.name,
        type: data.type,
        icon: data.icon.trim() || null,
        // Null clears stored meta (buildMeta collapses an empty editor).
        meta,
      };
      if (realAccount) {
        await withApiFeedback(
          appClient.api.bookkeeping["real-accounts"][":id"].$patch,
        )({
          param: { id: realAccount.id },
          // Type is immutable in edit mode; omit rather than echo it back.
          json: { name: body.name, icon: body.icon, meta },
        });
      } else {
        await withApiFeedback(appClient.api.bookkeeping["real-accounts"].$post)(
          { json: body },
        );
      }
      queryClient.invalidateQueries({ queryKey: realAccountsQueryKey });
      toast.success(realAccount ? t("updateSuccess") : t("createSuccess"));
      onOpenChange(false);
    } catch {
      // handled by withApiFeedback
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{realAccount ? t("edit") : t("create")}</DialogTitle>
          <DialogDescription>
            {realAccount ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <RealAccountForm
            key={formKey}
            ref={formRef}
            defaultValues={
              realAccount
                ? realAccountToFormValues(realAccount)
                : { name: "", type: "asset", icon: "", metaEntries: [] }
            }
            typeDisabled={!!realAccount}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
