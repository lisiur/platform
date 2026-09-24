-- AlterTable
ALTER TABLE "ai_model" ADD COLUMN     "maxImageEdge" INTEGER,
ADD COLUMN     "maxPixelsPerImage" INTEGER,
ADD COLUMN     "maxImagesPerRequest" INTEGER,
ADD COLUMN     "imageMediaTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
