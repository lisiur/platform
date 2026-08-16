"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { type Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

const SYSTEM_SCOPE_PREFIX = "system/";

function stripSystemPrefix(code: string): string {
  return code.startsWith(SYSTEM_SCOPE_PREFIX)
    ? code.slice(SYSTEM_SCOPE_PREFIX.length)
    : code;
}

type RoleInput = {
  name: string;
  code: string;
};

interface RoleDialogProps {
  role?: { id: string; name: string; code: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RoleDialog({
  role,
  open,
  onOpenChange,
  onSuccess,
}: RoleDialogProps) {
  const t = useTranslations("Roles");
  const isEdit = !!role;
  const roleSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<RoleInput>({
    resolver: zodResolver(roleSchema) as Resolver<RoleInput>,
    defaultValues: {
      name: role?.name ?? "",
      code: role?.code ? stripSystemPrefix(role.code) : "",
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  async function onSubmit(data: RoleInput) {
    try {
      const json = {
        name: data.name,
        code: `${SYSTEM_SCOPE_PREFIX}${data.code}`,
      };
      if (isEdit && role) {
        await withApiFeedback(appClient.api.roles[":id"].$put)({
          param: { id: role.id },
          json,
        });
      } else {
        await withApiFeedback(appClient.api.roles.$post)({ json });
      }
      reset();
      onSuccess();
    } catch {
      // Error handled by API feedback.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editRole") : t("addRole")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editRoleDescription") : t("addRoleDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="role-dialog-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="role-name" required>
                  {t("name")}
                </FieldLabel>
                <Input
                  id="role-name"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                <FieldError errors={errors.name ? [errors.name] : undefined} />
              </Field>
              <Field data-invalid={!!errors.code}>
                <FieldLabel htmlFor="role-code" required>
                  {t("code")}
                </FieldLabel>
                <Input
                  id="role-code"
                  aria-invalid={!!errors.code}
                  {...register("code")}
                />
                <FieldError errors={errors.code ? [errors.code] : undefined} />
              </Field>
            </FieldGroup>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" form="role-dialog-form" disabled={isSubmitting}>
            {isSubmitting ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
