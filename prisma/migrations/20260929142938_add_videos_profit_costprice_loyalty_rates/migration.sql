-- AlterTable
ALTER TABLE "LoyaltySettings" ADD COLUMN     "amountPerPointSecondary" DOUBLE PRECISION NOT NULL DEFAULT 299,
ADD COLUMN     "pointsExplanation" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "profit" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costPrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "HomepageVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "videoUrl" TEXT NOT NULL,
    "posterImage" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageVideo_pkey" PRIMARY KEY ("id")
);
