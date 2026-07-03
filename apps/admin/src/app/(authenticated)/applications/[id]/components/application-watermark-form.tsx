"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Switch,
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface ApplicationWatermarkFormProps {
  appId: string;
  app: {
    watermarkEnabled: boolean;
    watermarkConfig?: string | null;
  };
  onSuccess: () => void;
}

interface WatermarkConfig {
  content?: string;
}

function parseConfig(raw?: string | null): WatermarkConfig {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as WatermarkConfig;
  } catch {
    return {};
  }
}

export function ApplicationWatermarkForm({
  appId,
  app,
  onSuccess,
}: ApplicationWatermarkFormProps) {
  const t = useTranslations("Applications");

  const watermarkSchema = z.object({
    enabled: z.boolean(),
    content: z.string().optional(),
  });

  type WatermarkInput = z.infer<typeof watermarkSchema>;

  const existing = parseConfig(app.watermarkConfig);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WatermarkInput>({
    resolver: zodResolver(watermarkSchema),
    defaultValues: {
      enabled: app.watermarkEnabled,
      content: existing.content ?? "",
    },
  });

  async function onSubmit(data: WatermarkInput) {
    const config: WatermarkConfig = {
      content: data.content || undefined,
    };
    try {
      await withApiFeedback(appClient.api.applications[":id"].$put)({
        param: { id: appId },
        json: {
          watermarkEnabled: data.enabled,
          watermarkConfig: JSON.stringify(config),
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
        <Field orientation="horizontal" className="justify-between">
          <div className="space-y-1">
            <FieldLabel htmlFor="watermark-enabled">
              {t("watermarkEnabled")}
            </FieldLabel>
            <FieldDescription>{t("watermarkHint")}</FieldDescription>
          </div>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch
                id="watermark-enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="watermark-content">
            {t("watermarkContent")}
          </FieldLabel>
          <Textarea
            id="watermark-content"
            {...register("content")}
            rows={2}
            placeholder={t("watermarkContentPlaceholder")}
          />
          <FieldError errors={errors.content ? [errors.content] : undefined} />
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
