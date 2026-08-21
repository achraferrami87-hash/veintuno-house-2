-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "showInNav" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "volume" TEXT DEFAULT '50ML';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "clientOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientOrderId_key" ON "Order"("clientOrderId");

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whatsappNumber" TEXT,
    "instagramLink" TEXT,
    "instagramQrImage" TEXT,
    "perfumeDisclaimer" TEXT NOT NULL DEFAULT 'Inspiré des plus grands parfums — non affilié aux marques citées.',
    "updatedAt" DATETIME NOT NULL
);
