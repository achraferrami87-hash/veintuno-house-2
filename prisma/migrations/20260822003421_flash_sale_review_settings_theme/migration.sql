-- CreateTable
CREATE TABLE "ReviewSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minRating" INTEGER NOT NULL DEFAULT 1,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "showCustomerName" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" TEXT NOT NULL DEFAULT 'recent',
    "displayCount" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "notesTop" TEXT,
    "notesHeart" TEXT,
    "notesBase" TEXT,
    "gender" TEXT,
    "genders" TEXT NOT NULL DEFAULT '[]',
    "volume" TEXT DEFAULT '50ML',
    "price" REAL NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "images" TEXT NOT NULL DEFAULT '[]',
    "videoUrl" TEXT,
    "shape" TEXT NOT NULL DEFAULT 'bottle',
    "color" TEXT NOT NULL DEFAULT '#0c0c0c',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "isLimitedEdition" BOOLEAN NOT NULL DEFAULT false,
    "packEligible" BOOLEAN NOT NULL DEFAULT true,
    "freePackEligible" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "flashSaleActive" BOOLEAN NOT NULL DEFAULT false,
    "flashSalePrice" REAL,
    "flashSaleStart" DATETIME,
    "flashSaleEnd" DATETIME,
    "flashSaleLabel" TEXT,
    "collectionId" TEXT NOT NULL,
    CONSTRAINT "Product_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("collectionId", "color", "createdAt", "description", "freePackEligible", "gender", "genders", "id", "images", "isActive", "isBestSeller", "isLimitedEdition", "isNew", "lowStockThreshold", "name", "notes", "notesBase", "notesHeart", "notesTop", "packEligible", "position", "price", "shape", "slug", "stock", "updatedAt", "videoUrl", "volume") SELECT "collectionId", "color", "createdAt", "description", "freePackEligible", "gender", "genders", "id", "images", "isActive", "isBestSeller", "isLimitedEdition", "isNew", "lowStockThreshold", "name", "notes", "notesBase", "notesHeart", "notesTop", "packEligible", "position", "price", "shape", "slug", "stock", "updatedAt", "videoUrl", "volume" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE TABLE "new_Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("createdAt", "customerName", "id", "orderId", "productId", "rating", "status", "text", "updatedAt") SELECT "createdAt", "customerName", "id", "orderId", "productId", "rating", "status", "text", "updatedAt" FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE TABLE "new_SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whatsappNumber" TEXT,
    "instagramLink" TEXT,
    "instagramQrImage" TEXT,
    "perfumeDisclaimer" TEXT NOT NULL DEFAULT 'Inspiré des plus grands parfums — non affilié aux marques citées.',
    "defaultTheme" TEXT NOT NULL DEFAULT 'clair',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SiteSettings" ("id", "instagramLink", "instagramQrImage", "perfumeDisclaimer", "updatedAt", "whatsappNumber") SELECT "id", "instagramLink", "instagramQrImage", "perfumeDisclaimer", "updatedAt", "whatsappNumber" FROM "SiteSettings";
DROP TABLE "SiteSettings";
ALTER TABLE "new_SiteSettings" RENAME TO "SiteSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
