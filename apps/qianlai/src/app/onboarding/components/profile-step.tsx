"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AvatarUpload } from "@/app/(authenticated)/profile/components/avatar-upload";
import { appClient, withApiFeedback } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";

interface ProfileStepProps {
  initialName: string;
  initialAvatar: string | null | undefined;
}

export function ProfileStep({ initialName, initialAvatar }: ProfileStepProps) {
  const t = useTranslations("Onboarding");
  const [avatar, setAvatar] = useState(initialAvatar);
  const [saving, setSaving] = useState(false);

  const nameSchema = z.object({
    name: z.string().min(1, t("nameRequired")),
  });

  type NameInput = z.infer<typeof nameSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: initialName },
  });

  async function onSubmit(data: NameInput) {
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.auth["update-user"].$post)({
        json: { name: data.name },
      });
      await useSessionStore.getState().refetchSession();
      toast.success(t("profileSaved"));
    } catch {
      // Errors are surfaced by withApiFeedback.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AvatarUpload
        currentImage={avatar}
        name={initialName}
        onImageUpdate={setAvatar}
      />
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="onboarding-name" required>
              {t("name")}
            </FieldLabel>
            <Input
              id="onboarding-name"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FieldError errors={errors.name ? [errors.name] : undefined} />
          </Field>
        </FieldGroup>
        <div className="flex justify-end">
          <Button type="submit" variant="outline" disabled={saving || !isDirty}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
