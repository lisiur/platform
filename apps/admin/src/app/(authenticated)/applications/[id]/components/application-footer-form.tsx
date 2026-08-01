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

interface ApplicationFooterFormProps {
  appId: string;
  app: {
    copyright?: string | null;
    icp?: string | null;
    psif?: string | null;
  };
  onSuccess: () => void;
}

export function ApplicationFooterForm({
  appId,
  app,
  onSuccess,
}: ApplicationFooterFormProps) {
  const t = useTranslations("Applications");

  const footerSchema = z.object({
    copyright: z.string().optional(),
    icp: z.string().optional(),
    psif: z.string().optional(),
  });

  type FooterInput = z.infer<typeof footerSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FooterInput>({
    resolver: zodResolver(footerSchema),
    defaultValues: {
      copyright: app.copyright ?? "",
      icp: app.icp ?? "",
      psif: app.psif ?? "",
    },
  });

  async function onSubmit(data: FooterInput) {
    try {
      await withApiFeedback(appClient.api.applications[":id"].$put)({
        param: { id: appId },
        json: {
          copyright: data.copyright || null,
          icp: data.icp || null,
          psif: data.psif || null,
        },
      });
      toast.success(t("updateSuccess"));
      reset(data);
      onSuccess();
    } catch {
      // Error handled by client
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="copyright">{t("copyright")}</FieldLabel>
          <Textarea
            id="copyright"
            {...register("copyright")}
            rows={2}
            placeholder={t("copyrightPlaceholder")}
          />
          <FieldError
            errors={errors.copyright ? [errors.copyright] : undefined}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="icp">{t("icp")}</FieldLabel>
          <Input
            id="icp"
            {...register("icp")}
            placeholder={t("icpPlaceholder")}
          />
          <FieldError errors={errors.icp ? [errors.icp] : undefined} />
        </Field>
        <Field>
          <FieldLabel htmlFor="psif">{t("psif")}</FieldLabel>
          <Input
            id="psif"
            {...register("psif")}
            placeholder={t("psifPlaceholder")}
          />
          <FieldError errors={errors.psif ? [errors.psif] : undefined} />
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
