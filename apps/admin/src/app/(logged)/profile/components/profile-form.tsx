"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/api";

interface ProfileFormProps {
  initialName: string;
  onNameUpdate: (name: string) => void;
}

export function ProfileForm({ initialName, onNameUpdate }: ProfileFormProps) {
  const t = useTranslations("Profile");
  const [saving, setSaving] = useState(false);

  const profileSchema = z.object({
    name: z.string().min(1, t("validation.nameRequired")),
  });

  type ProfileInput = z.infer<typeof profileSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: { name: initialName },
  });

  async function onSubmit(data: ProfileInput) {
    setSaving(true);
    try {
      const { error } = await authClient.updateUser({
        name: data.name,
      });
      if (error) throw new Error(error.message);
      onNameUpdate(data.name);
      toast.success(t("profileUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-medium">
          {t("name")}
        </label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !isDirty}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
