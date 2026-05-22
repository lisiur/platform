"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appClient, authClient } from "@/lib/api";

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
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Application {
  id: string;
  name: string;
  code: string;
}

interface Role {
  id: string;
  appId: string;
  name: string;
  code: string;
}

interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  role: {
    id: string;
    appId: string;
    name: string;
    code: string;
  };
  createdAt: string;
}

export function UserDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: UserDialogProps) {
  const t = useTranslations("Users");
  const isEdit = !!user;

  const [applications, setApplications] = useState<Application[]>([]);
  const [appRoles, setAppRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>("");

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
            role: data.role,
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

  useEffect(() => {
    if (open) {
      appClient.api.applications.$get({ query: { limit: 100, offset: 0 } }).then((res) => {
        if (res.ok)
          res.json().then((d) => setApplications(d.applications ?? []));
      });
    }
  }, [open]);

  useEffect(() => {
    if (selectedAppId) {
      appClient.api.roles
        .$get({ query: { appId: selectedAppId } })
        .then((res) => {
          if (res.ok) res.json().then((d) => setAppRoles(d));
        });
    }
  }, [selectedAppId]);

  useEffect(() => {
    if (user?.id && open) {
      appClient.api["user-role"]
        .$get({ query: { userId: user.id } })
        .then((res) => {
          if (res.ok) res.json().then((d) => setUserRoles(d));
        });
    }
  }, [user?.id, open]);

  async function handleAssignRole(roleId: string) {
    if (!user?.id) return;
    await appClient.api["user-role"].$post({
      json: { userId: user.id, roleId },
    });
    const res = await appClient.api["user-role"].$get({
      query: { userId: user.id },
    });
    if (res.ok) {
      const d = await res.json();
      setUserRoles(d);
    }
  }

  async function handleRemoveRole(roleId: string) {
    if (!user?.id) return;
    await appClient.api["user-role"].remove.$post({
      json: { userId: user.id, roleId },
    });
    const res = await appClient.api["user-role"].$get({
      query: { userId: user.id },
    });
    if (res.ok) {
      const d = await res.json();
      setUserRoles(d);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editUser") : t("addUser")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editUserDescription") : t("addUserDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="role">{t("role")}</Label>
            <Select
              value={watch("role") ?? "user"}
              onValueChange={(value) => setValue("role", value ?? undefined)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                <SelectItem value="user">{t("roles.user")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("appRoles")}</Label>
            <div className="rounded-md border p-3 space-y-2">
              {userRoles.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {userRoles.map((ur) => (
                    <Badge key={ur.id} variant="secondary" className="gap-1">
                      {ur.role.name} (
                      {applications.find((a) => a.id === ur.role.appId)?.name ??
                        "?"}
                      )
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        onClick={() => handleRemoveRole(ur.roleId)}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Select value={selectedAppId} onValueChange={(v) => setSelectedAppId(v ?? "")}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("selectApp")} />
                  </SelectTrigger>
                  <SelectContent>
                    {applications.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAppId && (
                  <Select
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        handleAssignRole(value);
                        setSelectedAppId("");
                      }
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t("selectRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      {appRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
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
