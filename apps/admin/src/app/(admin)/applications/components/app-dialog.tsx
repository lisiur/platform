"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appClient } from "@/lib/api";
import { uploadPublicFile } from "@/lib/api/upload-file";
import { withApiFeedback } from "@/lib/api/utils";

const appSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  logo: z.string().optional().or(z.literal("")),
});

type AppInput = z.infer<typeof appSchema>;

interface AppDialogProps {
  app?: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
    logo?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AppDialog({
  app,
  open,
  onOpenChange,
  onSuccess,
}: AppDialogProps) {
  const t = useTranslations("Applications");
  const isEdit = !!app;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(app?.logo ?? "");
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<AppInput>({
    resolver: zodResolver(appSchema),
    defaultValues: {
      name: app?.name ?? "",
      code: app?.code ?? "",
      description: app?.description ?? "",
      logo: app?.logo ?? "",
    },
  });

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

  async function onSubmit(data: AppInput) {
    try {
      const logo = selectedLogoFile
        ? await uploadPublicFile(selectedLogoFile)
        : logoRemoved
          ? null
          : (app?.logo ?? null);

      if (isEdit) {
        await withApiFeedback(appClient.api.applications[":id"].$put)({
          param: { id: app.id },
          json: {
            name: data.name,
            code: data.code,
            description: data.description || null,
            logo,
          },
        });
      } else {
        await withApiFeedback(appClient.api.applications.$post)({
          json: {
            name: data.name,
            code: data.code,
            description: data.description || undefined,
            logo: logo ?? undefined,
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
      setLogoPreview(app?.logo ?? "");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editApp") : t("addApp")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editAppDescription") : t("addAppDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              <Textarea
                id="description"
                {...register("description")}
                rows={3}
              />
              <FieldError
                errors={errors.description ? [errors.description] : undefined}
              />
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
          </FieldGroup>
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
