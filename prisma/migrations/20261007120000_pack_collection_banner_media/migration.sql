-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "bannerImage" TEXT,
ADD COLUMN     "bannerTagline" TEXT,
ADD COLUMN     "bannerTitle" TEXT;

-- AlterTable
ALTER TABLE "Pack" ADD COLUMN     "blurb" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "tagline" TEXT;

