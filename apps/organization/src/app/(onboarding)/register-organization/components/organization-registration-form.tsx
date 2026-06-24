"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

interface OrganizationRegistrationFormProps {
  onSuccess?: () => void | Promise<void>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OrganizationRegistrationForm({
  onSuccess,
}: OrganizationRegistrationFormProps) {
  const t = useTranslations("RegisterOrganization");
  const tc = useTranslations("Common");
  const slugEditedRef = useRef(false);

  const orgSchema = z.object({
    name: z.string().min(1, tc("required", { field: t("name") })),
    slug: z
      .string()
      .min(1, tc("required", { field: t("slug") }))
      .regex(/^[a-z0-9-]+$/, t("invalidSlug")),
    metadata: z.string().optional(),
  });

  type OrgInput = z.infer<typeof orgSchema>;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrgInput>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: "", slug: "", metadata: "" },
  });

  const nameValue = watch("name");

  useEffect(() => {
    if (!slugEditedRef.current) {
      setValue("slug", slugify(nameValue));
    }
  }, [nameValue, setValue]);

  async function onSubmit(data: OrgInput) {
    await withApiFeedback(appClient.api.organizations.register.$post, {
      showError: false,
    })({
      json: {
        name: data.name,
        slug: data.slug,
        metadata: data.metadata || undefined,
      },
    });
    toast.success(t("registrationSuccess"));
    await onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-name">{t("name")}</FieldLabel>
              <Input
                id="organization-name"
                placeholder={t("namePlaceholder")}
                {...register("name")}
              />
              <FieldError errors={errors.name ? [errors.name] : undefined} />
            </Field>

            <Field>
              <FieldLabel htmlFor="organization-slug">{t("slug")}</FieldLabel>
              <Input
                id="organization-slug"
                placeholder="acme-corp"
                {...register("slug", {
                  onChange: () => {
                    slugEditedRef.current = true;
                  },
                })}
              />
              <FieldDescription>{t("slugDescription")}</FieldDescription>
              <FieldError errors={errors.slug ? [errors.slug] : undefined} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("additionalInfoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-metadata">
                {t("metadata")}
              </FieldLabel>
              <Textarea
                id="organization-metadata"
                rows={3}
                placeholder={t("metadataPlaceholder")}
                {...register("metadata")}
              />
              <FieldDescription>{t("metadataDescription")}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("registering") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
