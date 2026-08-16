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
  ImageCropper,
  type ImageCropperRef,
  Input,
} from "@repo/ui";
import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

const orgSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  logo: z.string().optional().or(z.literal("")),
});

type OrgInput = z.infer<typeof orgSchema>;

interface OrganizationDialogProps {
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
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
  const cropperRef = useRef<ImageCropperRef>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(
    organization?.logo ?? "",
  );
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [_logoRemoved, setLogoRemoved] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

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
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleCropConfirm() {
    const file = await cropperRef.current?.getCroppedFile(
      { width: 128, height: 128, type: "image/png" },
      "logo.png",
    );
    if (!file) return;

    clearLogoObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = previewUrl;
    setSelectedLogoFile(file);
    setLogoRemoved(false);
    setLogoPreview(previewUrl);
    setValue("logo", previewUrl, { shouldValidate: true });
    setCropOpen(false);
  }

  function handleCropOpenChange(open: boolean) {
    setCropOpen(open);
    if (!open) {
      setCropSrc(null);
      cropperRef.current?.reset();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function _handleRemoveLogo() {
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
      if (isEdit) {
        await withApiFeedback(appClient.api.organizations[":id"].$put)({
          param: { id: organization.id },
          form: {
            name: data.name,
            slug: data.slug,
            ...(selectedLogoFile ? { logo: selectedLogoFile } : {}),
          },
        });
      } else {
        await withApiFeedback(appClient.api.organizations.$post)({
          form: {
            name: data.name,
            slug: data.slug,
            ...(selectedLogoFile ? { logo: selectedLogoFile } : {}),
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
    <>
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
                  <FieldLabel htmlFor="name" required>
                    {t("name")}
                  </FieldLabel>
                  <Input id="name" {...register("name")} />
                  <FieldError
                    errors={errors.name ? [errors.name] : undefined}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="slug" required>
                    {t("slug")}
                  </FieldLabel>
                  <Input id="slug" {...register("slug")} />
                  <FieldError
                    errors={errors.slug ? [errors.slug] : undefined}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("logo")}</FieldLabel>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex items-center gap-6">
                    <div className="h-20 w-20 shrink-0">
                      {logoPreview ? (
                        <Image
                          src={logoPreview}
                          alt="Logo preview"
                          width={80}
                          height={80}
                          className="rounded-lg border object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-muted">
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {t("chooseFile")}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("logoHint")}
                      </p>
                    </div>
                  </div>
                  <FieldError
                    errors={errors.logo ? [errors.logo] : undefined}
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

      <Dialog open={cropOpen} onOpenChange={handleCropOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cropLogo")}</DialogTitle>
            <DialogDescription>{t("cropLogoDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {cropSrc && (
              <ImageCropper
                ref={cropperRef}
                src={cropSrc}
                aspect={1}
                keepSelection
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => cropperRef.current?.reset()}
            >
              {t("resetCrop")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCropOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="button" size="sm" onClick={handleCropConfirm}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
