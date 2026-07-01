"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface ApplicationBasicInfoFormProps {
  appId: string;
  app: {
    name: string;
    code: string;
    description?: string | null;
  };
  onSuccess: () => void;
}

export function ApplicationBasicInfoForm({
  appId,
  app,
  onSuccess,
}: ApplicationBasicInfoFormProps) {
  const t = useTranslations("Applications");

  const basicInfoSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    description: z.string().optional(),
  });

  type BasicInfoInput = z.infer<typeof basicInfoSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BasicInfoInput>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      name: app.name,
      code: app.code,
      description: app.description ?? "",
    },
  });

  async function onSubmit(data: BasicInfoInput) {
    try {
      await withApiFeedback(appClient.api.applications[":id"].$put)({
        param: { id: appId },
        json: {
          name: data.name,
          code: data.code,
          description: data.description || null,
        },
      });
      toast.success(t("updateSuccess"));
      onSuccess();
    } catch {
      // Error handled by client
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>
        <Field>
          <FieldLabel htmlFor="code">{t("code")}</FieldLabel>
          <Input id="code" {...register("code")} />
          <FieldError errors={errors.code ? [errors.code] : undefined} />
        </Field>
        <Field>
          <FieldLabel htmlFor="description">
            {t("description_label")}
          </FieldLabel>
          <Textarea id="description" {...register("description")} rows={3} />
          <FieldError
            errors={errors.description ? [errors.description] : undefined}
          />
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
