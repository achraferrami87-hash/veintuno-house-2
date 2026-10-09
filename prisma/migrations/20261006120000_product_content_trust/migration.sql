-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "benefits" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "deliveryInfo" TEXT,
ADD COLUMN     "ingredients" TEXT,
ADD COLUMN     "usage" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "trustSignals" TEXT NOT NULL DEFAULT '[]';

