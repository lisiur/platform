"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isProtectedUser } from "@repo/shared";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/api";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().optional(),
  role: z.enum(["admin", "user"]).optional(),
});

type UserInput = z.infer<typeof userSchema>;

interface UserDialogProps {
  user?: {
    id: string;
    name: string;
    email: string;
    role?: string;
    flags?: string[] | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UserDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: UserDialogProps) {
  const t = useTranslations("Users");
  const isEdit = !!user;
  const protectedUser = isProtectedUser(user?.flags);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<UserInput>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      role: (user?.role as "admin" | "user") ?? "user",
    },
  });

  async function onSubmit(data: UserInput) {
    if (!isEdit && (!data.password || data.password.length === 0)) {
      return;
    }
    try {
      if (isEdit) {
        await authClient.admin.updateUser({
          userId: user.id,
          data: {
            name: data.name,
            email: data.email,
            ...(protectedUser ? {} : { role: data.role }),
          },
        });
      } else {
        await authClient.admin.createUser({
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
        });
      }
      reset();
      onSuccess();
    } catch {
      // Error handled by auth client
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editUser") : t("addUser")}</DialogTitle>
          <DialogDescription>
            {protectedUser
              ? t("protectedUserDescription")
              : isEdit
                ? t("editUserDescription")
                : t("addUserDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={errors.name ? [errors.name] : undefined} />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input id="email" type="email" {...register("email")} />
              <FieldError errors={errors.email ? [errors.email] : undefined} />
            </Field>
            {!isEdit && (
              <Field>
                <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  {...register("password")}
                />
                <FieldError
                  errors={errors.password ? [errors.password] : undefined}
                />
              </Field>
            )}
            <Field>
              <FieldLabel>{t("role")}</FieldLabel>
              <Field orientation="horizontal" className="gap-2">
                <Checkbox
                  id="is-admin"
                  checked={watch("role") === "admin"}
                  disabled={protectedUser}
                  onCheckedChange={(checked) =>
                    setValue("role", checked ? "admin" : "user")
                  }
                />
                <FieldLabel htmlFor="is-admin" className="font-normal">
                  {t("roles.admin")}
                </FieldLabel>
              </Field>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
