"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { authClient } from "@/lib/api";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().optional(),
  role: z.string().optional(),
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

export function UserDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: UserDialogProps) {
  const t = useTranslations("Users");
  const isEdit = !!user;

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
      role: user?.role ?? "user",
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
          role: data.role as "admin" | "manager" | "user",
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
                <SelectItem value="manager">{t("roles.manager")}</SelectItem>
                <SelectItem value="user">{t("roles.user")}</SelectItem>
              </SelectContent>
            </Select>
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
