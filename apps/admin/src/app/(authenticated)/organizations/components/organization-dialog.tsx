"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
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
  Textarea,
} from "@repo/ui";
import { ImagePlus, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { uploadPublicFile } from "@/lib/api/upload-file";
import { withApiFeedback } from "@/lib/api/utils";

const orgSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  logo: z.string().optional().or(z.literal("")),
  metadata: z.string().optional(),
});

type OrgInput = z.infer<typeof orgSchema>;

interface OrganizationDialogProps {
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    metadata?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OrganizationDialog({
  organization,
  open,
  onOpenChange,
  onSuccess,
}: OrganizationDialogProps) {
  const t = useTranslations("Organizations");
  const isEdit = !!organization;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(
    organization?.logo ?? "",
  );
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm<OrgInput>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
      logo: organization?.logo ?? "",
      metadata: organization?.metadata ?? "",
    },
  });

  const watchName = watch("name");

  const clearLogoObjectUrl = useCallback(() => {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => clearLogoObjectUrl, [clearLogoObjectUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("logoTooLarge"));
      return;
    }
    clearLogoObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = previewUrl;
    setSelectedLogoFile(file);
    setLogoRemoved(false);
    setLogoPreview(previewUrl);
    setValue("logo", previewUrl, { shouldValidate: true });
  }

  function handleRemoveLogo() {
    clearLogoObjectUrl();
    setSelectedLogoFile(null);
    setLogoRemoved(true);
    setLogoPreview("");
    setValue("logo", "", { shouldValidate: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!isEdit && watchName) {
      setValue("slug", slugify(watchName));
    }
  }, [isEdit, watchName, setValue]);

  async function onSubmit(data: OrgInput) {
    try {
      const logo = selectedLogoFile
        ? await uploadPublicFile(selectedLogoFile)
        : logoRemoved
          ? null
          : (organization?.logo ?? null);

      if (isEdit) {
        await withApiFeedback(appClient.api.organizations[":id"].$put)({
          param: { id: organization.id },
          json: {
            name: data.name,
            slug: data.slug,
            logo,
            metadata: data.metadata || null,
          },
        });
      } else {
        await withApiFeedback(appClient.api.organizations.$post)({
          json: {
            name: data.name,
            slug: data.slug,
            logo: logo ?? undefined,
            metadata: data.metadata || undefined,
          },
        });
      }
      clearLogoObjectUrl();
      setSelectedLogoFile(null);
      setLogoRemoved(false);
      reset();
      onSuccess();
    } catch {
      // Error handled by client
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      clearLogoObjectUrl();
      setSelectedLogoFile(null);
      setLogoRemoved(false);
      reset();
      setLogoPreview(organization?.logo ?? "");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editOrg") : t("addOrg")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editOrgDescription") : t("addOrgDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="organization-dialog-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
                <Input id="name" {...register("name")} />
                <FieldError errors={errors.name ? [errors.name] : undefined} />
              </Field>
              <Field>
                <FieldLabel htmlFor="slug">{t("slug")}</FieldLabel>
                <Input id="slug" {...register("slug")} />
                <FieldError errors={errors.slug ? [errors.slug] : undefined} />
              </Field>
              <Field>
                <FieldLabel>{t("logo")}</FieldLabel>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {logoPreview ? (
                  <div className="relative inline-block">
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      width={80}
                      height={80}
                      className="rounded-lg border object-cover"
                      unoptimized
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={handleRemoveLogo}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {t("uploadLogo")}
                  </Button>
                )}
                <FieldError errors={errors.logo ? [errors.logo] : undefined} />
              </Field>
              <Field>
                <FieldLabel htmlFor="metadata">{t("metadata")}</FieldLabel>
                <Textarea id="metadata" {...register("metadata")} rows={3} />
                <FieldError
                  errors={errors.metadata ? [errors.metadata] : undefined}
                />
              </Field>
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
          <Button
            type="submit"
            form="organization-dialog-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
