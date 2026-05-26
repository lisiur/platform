"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";

interface DeleteConfirmDialogProps {
  organization: {
    id: string;
    name: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteConfirmDialog({
  organization,
  open,
  onOpenChange,
  onSuccess,
}: DeleteConfirmDialogProps) {
  const t = useTranslations("Organizations");
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await apiWithFeedback(appClient.api.organizations[":id"].$delete)({
        param: { id: organization.id },
      });
      onSuccess();
    } catch {
      // Error handled by client
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteOrg")}</DialogTitle>
          <DialogDescription>
            {t("confirmDelete")} <strong>{organization.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
