"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ImageCropper,
  type ImageCropperRef,
} from "@repo/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";

interface AvatarUploadProps {
  currentImage?: string | null;
  name: string;
  onImageUpdate: (url: string) => void;
}

export function AvatarUpload({
  currentImage,
  name,
  onImageUpdate,
}: AvatarUploadProps) {
  const t = useTranslations("Profile");
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<ImageCropperRef>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("fileTooLarge"));
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
      "avatar.png",
    );
    if (!file) return;

    setUploading(true);
    try {
      const res = await withApiFeedback(appClient.api.upload.$post)({
        form: { file, visibility: "public" },
      });
      const data = await res.json();
      const imageUrl = data.url;

      await withApiFeedback(appClient.api.auth["update-user"].$post)({
        json: { image: imageUrl },
      });

      onImageUpdate(imageUrl);
      toast.success(t("avatarUpdated"));

      await useSessionStore.getState().refetchSession();
      setCropOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
        {currentImage ? (
          <Image
            src={currentImage}
            alt="Avatar"
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
            {initials}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {t("chooseFile")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
      </div>

      <Dialog open={cropOpen} onOpenChange={handleCropOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cropImage")}</DialogTitle>
            <DialogDescription>{t("cropImageDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {cropSrc && (
              <ImageCropper
                ref={cropperRef}
                src={cropSrc}
                aspect={1}
                circularCrop
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
              disabled={uploading}
            >
              {t("resetCrop")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCropOpenChange(false)}
              disabled={uploading}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCropConfirm}
              disabled={uploading}
            >
              {uploading ? t("uploading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
