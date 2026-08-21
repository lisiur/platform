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
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { isRecord } from "./notification-form-utils";
import type { NotificationTemplate } from "./types";

interface NotificationTestDialogProps {
  template: NotificationTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
}

interface UserOption {
  id: string;
  name: string;
  email: string | null;
}

function parseVariablesSchema(schema: unknown): TemplateVariable[] {
  if (!isRecord(schema)) return [];

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  );

  return Object.entries(properties)
    .filter(([, property]) => isRecord(property))
    .map(([name, property]) => ({
      name,
      description:
        isRecord(property) && typeof property.description === "string"
          ? property.description
          : "",
      required: required.has(name),
    }));
}

export function NotificationTestDialog({
  template,
  open,
  onOpenChange,
}: NotificationTestDialogProps) {
  const t = useTranslations("Notifications");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [sending, setSending] = useState(false);

  const variables = useMemo(
    () => parseVariablesSchema(template.variablesSchema),
    [template.variablesSchema],
  );

  useEffect(() => {
    if (!open) return;
    setRecipientUserId("");
    setVariableValues({});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function fetchUsers() {
      setLoadingUsers(true);
      try {
        const res = await appClient.api.users.$get({
          query: { limit: 50, offset: 0 },
        });
        if (cancelled) return;
        const data = await res.json();
        setUsers(data.users);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    void fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const requiredVariables = variables.filter((v) => v.required);
  const requiredVariablesFilled = requiredVariables.every((v) =>
    variableValues[v.name]?.trim(),
  );
  const canSubmit = !!recipientUserId && requiredVariablesFilled && !sending;

  async function handleSubmit() {
    setSending(true);
    try {
      await withApiFeedback(
        appClient.api["notification-templates"][":id"]["send-test"].$post,
      )({
        param: { id: template.id },
        json: {
          recipientUserId,
          variables: variableValues,
        },
      });
      toast.success(t("templates.testSuccess"));
      onOpenChange(false);
    } catch {
      // Error handled by API feedback.
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("templates.test")}</DialogTitle>
          <DialogDescription>
            {t("templates.testDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="test-recipient" required>
                {t("fields.recipient")}
              </FieldLabel>
              {loadingUsers ? (
                <div className="flex items-center gap-2 py-2">
                  <Spinner className="h-4 w-4" />
                  <span className="text-muted-foreground text-sm">
                    {t("templates.loadingUsers")}
                  </span>
                </div>
              ) : (
                <Select
                  value={recipientUserId}
                  onValueChange={(value) => setRecipientUserId(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {recipientUserId
                        ? (() => {
                            const user = users.find(
                              (u) => u.id === recipientUserId,
                            );
                            return user
                              ? `${user.name} (${user.email ?? ""})`
                              : t("templates.selectRecipient");
                          })()
                        : t("templates.selectRecipient")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email ?? ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            {variables.length > 0 ? (
              <Field>
                <FieldLabel>{t("fields.testVariables")}</FieldLabel>
                <div className="space-y-3">
                  {variables.map((variable) => (
                    <Field key={variable.name}>
                      <FieldLabel
                        htmlFor={`test-var-${variable.name}`}
                        required={variable.required}
                      >
                        {variable.name}
                      </FieldLabel>
                      <Input
                        id={`test-var-${variable.name}`}
                        value={variableValues[variable.name] ?? ""}
                        onChange={(event) =>
                          setVariableValues((prev) => ({
                            ...prev,
                            [variable.name]: event.target.value,
                          }))
                        }
                        placeholder={variable.description || variable.name}
                      />
                    </Field>
                  ))}
                </div>
              </Field>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("templates.noVariables")}
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("actions.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {sending ? t("actions.saving") : t("actions.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
