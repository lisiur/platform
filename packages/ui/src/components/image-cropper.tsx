"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import ReactCrop, {
  type Crop,
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type PercentCrop,
  type PixelCrop,
} from "react-image-crop";
import { cn } from "#lib/utils";

export interface CropOutput {
  width: number;
  height: number;
  type?: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
}

async function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  output: CropOutput,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire 2D rendering context");
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    output.width,
    output.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas produced no blob"));
          return;
        }
        resolve(blob);
      },
      output.type ?? "image/png",
      output.quality,
    );
  });
}

export interface ImageCropperProps {
  src: string;
  aspect?: number;
  circularCrop?: boolean;
  keepSelection?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  ruleOfThirds?: boolean;
  initialCoverage?: number;
  className?: string;
}

export interface ImageCropperRef {
  getCroppedBlob: (output: CropOutput) => Promise<Blob | null>;
  getCroppedFile: (
    output: CropOutput,
    fileName?: string,
  ) => Promise<File | null>;
  reset: () => void;
}

function buildInitialCrop(
  aspect: number | undefined,
  coverage: number,
  width: number,
  height: number,
): Crop {
  const base = { unit: "%" as const, width: coverage };
  if (aspect) {
    return centerCrop(
      makeAspectCrop(base, aspect, width, height),
      width,
      height,
    );
  }
  return centerCrop({ ...base, height: coverage }, width, height);
}

function extensionForType(type: CropOutput["type"]): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return "png";
}

export const ImageCropper = forwardRef<ImageCropperRef, ImageCropperProps>(
  function ImageCropper(
    {
      src,
      aspect,
      circularCrop,
      keepSelection,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      ruleOfThirds,
      initialCoverage = 90,
      className,
    },
    ref,
  ) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [crop, setCrop] = useState<Crop>();
    const completedCropRef = useRef<PixelCrop | null>(null);

    const onImageLoad = useCallback(
      (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        const initial = buildInitialCrop(
          aspect,
          initialCoverage,
          width,
          height,
        ) as PercentCrop;
        setCrop(initial);
        completedCropRef.current = convertToPixelCrop(initial, width, height);
      },
      [aspect, initialCoverage],
    );

    const onChange = useCallback(
      (_pixel: PixelCrop, percentCrop: PercentCrop) => {
        setCrop(percentCrop);
      },
      [],
    );

    const onComplete = useCallback((pixel: PixelCrop) => {
      completedCropRef.current =
        pixel.width > 0 && pixel.height > 0 ? pixel : null;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        async getCroppedBlob(output: CropOutput) {
          const image = imgRef.current;
          const completed = completedCropRef.current;
          if (!image || !completed) return null;
          return getCroppedBlob(image, completed, output);
        },
        async getCroppedFile(output: CropOutput, fileName?: string) {
          const image = imgRef.current;
          const completed = completedCropRef.current;
          if (!image || !completed) return null;
          const blob = await getCroppedBlob(image, completed, output);
          const name = fileName ?? `cropped.${extensionForType(output.type)}`;
          return new File([blob], name, { type: blob.type });
        },
        reset() {
          completedCropRef.current = null;
          setCrop(undefined);
        },
      }),
      [],
    );

    return (
      <div className="flex justify-center">
        <ReactCrop
          crop={crop}
          onChange={onChange}
          onComplete={onComplete}
          aspect={aspect}
          circularCrop={circularCrop}
          keepSelection={keepSelection}
          minWidth={minWidth}
          maxWidth={maxWidth}
          minHeight={minHeight}
          maxHeight={maxHeight}
          ruleOfThirds={ruleOfThirds}
          className={cn(className)}
        >
          {/* react-image-crop needs a real <img> element it can measure */}
          {/* biome-ignore lint/performance/noImgElement: react-image-crop measures this img directly */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={onImageLoad}
            style={{ maxHeight: "60vh", maxWidth: "100%" }}
          />
        </ReactCrop>
      </div>
    );
  },
);
