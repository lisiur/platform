"use client";

import type { FetchPageParams, PermissionItem } from "@repo/frontend";
import { PermissionSelector } from "@repo/frontend";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface CreateTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenCreated: (token: string) => void;
}

export function CreateTokenDialog({
  open,
  onOpenChange,
  onTokenCreated,
}: CreateTokenDialogProps) {
  const t = useTranslations("Tokens");
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<PermissionItem[]>([]);
  const [allScopes, setAllScopes] = useState<PermissionItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    appClient.api["api-tokens"]["available-scopes"]
      .$get()
      .then((res) => res.json())
      .then((data) => setAllScopes(data.scopes ?? []))
      .catch(() => setAllScopes([]));
  }, [open]);

  const fetchPage = useCallback(
    (params: FetchPageParams) => {
      let filtered = allScopes ?? [];
      if (params.search) {
        const q = params.search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q),
        );
      }
      if (params.sort) {
        const sortKey = params.sort;
        filtered = [...filtered].sort((a, b) => {
          const av = String(a[sortKey]);
          const bv = String(b[sortKey]);
          const cmp = av.localeCompare(bv);
          return params.sortDir === "desc" ? -cmp : cmp;
        });
      }
      const total = filtered.length;
      const page = filtered.slice(params.offset, params.offset + params.limit);
      return Promise.resolve({ permissions: page, total });
    },
    [allScopes],
  );

  function reset() {
    setName("");
    setExpiresAt("");
    setSelectedIds([]);
    setSelectedItems([]);
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await withApiFeedback(appClient.api["api-tokens"].$post)({
        json: {
          name,
          scopes: (allScopes ?? [])
            .filter((s) => selectedIds.includes(s.id))
            .map((s) => s.code),
          ...(expiresAt
            ? { expiresAt: new Date(expiresAt).toISOString() }
            : {}),
        },
      });
      const data = await res.json();
      onTokenCreated(data.token);
      onOpenChange(false);
    } catch {
      // Error handled by API feedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="create-token-dialog-form"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <Field>
              <FieldLabel htmlFor="token-name">{t("fields.name")}</FieldLabel>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="token-expiry">
                {t("fields.expiry")}
              </FieldLabel>
              <Input
                id="token-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <FieldDescription>{t("fields.expiryHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t("fields.scopes")}</FieldLabel>
              <div className="h-[320px]">
                {allScopes ? (
                  <PermissionSelector
                    fetchPage={fetchPage}
                    value={selectedIds}
                    onChange={setSelectedIds}
                    selectedItems={selectedItems}
                  />
                ) : null}
              </div>
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="create-token-dialog-form"
            disabled={saving || selectedIds.length === 0}
          >
            {saving ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
