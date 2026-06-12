"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isBuiltinUser } from "@repo/shared";
import {
  Button,
  Checkbox,
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
  Spinner,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

type UserInput = {
  name: string;
  email: string;
  password?: string;
  roleIds: string[];
};

interface Role {
  id: string;
  appId: string;
  name: string;
  code: string;
}

interface UserRole {
  id: string;
  roleId: string;
  role: Role;
}

interface UserDialogProps {
  user?: {
    id: string;
    name: string;
    email: string;
    role?: string | null;
    flags?: string[] | null;
    userRoles?: UserRole[];
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
  const builtinUser = isBuiltinUser(user?.flags);
  const createUserSchema = z.object({
    name: z.string().min(1),
    email: z.email(),
    password: z.string().min(1, t("passwordRequired")),
    roleIds: z.array(z.string()),
  });
  const editUserSchema = z.object({
    name: z.string().min(1),
    email: z.email(),
    roleIds: z.array(z.string()),
  });

  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const res = await withApiFeedback(appClient.api.roles.$get)({
        query: { appId: "admin" },
      });
      const data = await res.json();
      setRoles(data);
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    if (open && !builtinUser) {
      fetchRoles();
    }
  }, [open, builtinUser, fetchRoles]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<UserInput>({
    resolver: zodResolver(
      isEdit ? editUserSchema : createUserSchema,
    ) as Resolver<UserInput>,
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      roleIds: user?.userRoles?.map((ur) => ur.roleId) ?? [],
    },
  });

  // Reset form when user changes
  useEffect(() => {
    if (open) {
      reset({
        name: user?.name ?? "",
        email: user?.email ?? "",
        password: "",
        roleIds: user?.userRoles?.map((ur) => ur.roleId) ?? [],
      });
    }
  }, [open, user, reset]);

  async function onSubmit(data: UserInput) {
    try {
      if (isEdit) {
        await withApiFeedback(appClient.api.users[":id"].$put)({
          param: { id: user.id },
          json: {
            name: data.name,
            email: data.email,
            ...(builtinUser ? {} : { roleIds: data.roleIds }),
          },
        });
      } else {
        await withApiFeedback(appClient.api.users.$post)({
          json: {
            name: data.name,
            email: data.email,
            password: data.password ?? "",
            roleIds: data.roleIds,
          },
        });
      }
      reset();
      onSuccess();
    } catch {
      // Error handled by API feedback.
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  function toggleRole(roleId: string) {
    const currentRoles = watch("roleIds");
    if (currentRoles.includes(roleId)) {
      setValue(
        "roleIds",
        currentRoles.filter((id) => id !== roleId),
        { shouldValidate: true },
      );
    } else {
      setValue("roleIds", [...currentRoles, roleId], {
        shouldValidate: true,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editUser") : t("addUser")}</DialogTitle>
          <DialogDescription>
            {builtinUser
              ? t("protectedUserDescription")
              : isEdit
                ? t("editUserDescription")
                : t("addUserDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="user-dialog-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
                <Input
                  id="name"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                <FieldError errors={errors.name ? [errors.name] : undefined} />
              </Field>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                <FieldError
                  errors={errors.email ? [errors.email] : undefined}
                />
              </Field>
              {!isEdit && (
                <Field data-invalid={!!errors.password}>
                  <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  <FieldError
                    errors={errors.password ? [errors.password] : undefined}
                  />
                </Field>
              )}
              {!builtinUser && (
                <Field>
                  <FieldLabel>{t("roles")}</FieldLabel>
                  {loadingRoles ? (
                    <div className="flex items-center gap-2 py-2">
                      <Spinner className="h-4 w-4" />
                      <span className="text-sm text-muted-foreground">
                        {t("loadingRoles")}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {roles.map((role) => (
                        <div key={role.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`role-${role.id}`}
                            checked={watch("roleIds").includes(role.id)}
                            onCheckedChange={() => toggleRole(role.id)}
                          />
                          <FieldLabel
                            htmlFor={`role-${role.id}`}
                            className="font-normal"
                          >
                            {role.name}
                          </FieldLabel>
                        </div>
                      ))}
                      {roles.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t("noRolesAvailable")}
                        </p>
                      )}
                    </div>
                  )}
                </Field>
              )}
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
          <Button type="submit" form="user-dialog-form" disabled={isSubmitting}>
            {isSubmitting ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
