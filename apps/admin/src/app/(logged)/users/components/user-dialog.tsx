"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isBuiltinUser } from "@repo/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Spinner } from "@/components/ui/spinner";
import { appClient } from "@/lib/api";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().optional(),
  roleIds: z.array(z.string()),
});

type UserInput = z.infer<typeof userSchema>;

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

  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const res = await appClient.api.roles.$get({
        query: { appId: "admin" },
      });
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch {
      toast.error(t("fetchRolesFailed"));
    } finally {
      setLoadingRoles(false);
    }
  }, [t]);

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
    resolver: zodResolver(userSchema),
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
    if (!isEdit && (!data.password || data.password.length === 0)) {
      return;
    }
    try {
      if (isEdit) {
        const res = await appClient.api["admin-users"][":id"].$put({
          param: { id: user.id },
          json: {
            name: data.name,
            email: data.email,
            ...(builtinUser ? {} : { roleIds: data.roleIds }),
          },
        });

        if (!res.ok) {
          const error = await res.json();
          toast.error(error.message || t("updateFailed"));
          return;
        }
      } else {
        const res = await appClient.api["admin-users"].$post({
          json: {
            name: data.name,
            email: data.email,
            password: data.password || "",
            roleIds: data.roleIds,
          },
        });

        if (!res.ok) {
          const error = await res.json();
          toast.error(error.message || t("createFailed"));
          return;
        }
      }
      reset();
      onSuccess();
    } catch {
      toast.error(isEdit ? t("updateFailed") : t("createFailed"));
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
