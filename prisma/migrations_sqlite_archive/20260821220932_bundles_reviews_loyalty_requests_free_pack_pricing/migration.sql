-- CreateTable
CREATE TABLE "LoyaltyRedemptionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pointsAtRequest" REAL NOT NULL,
    "requestedRewardId" TEXT,
    "requestedRewardName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "price" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("bundleId", "productId"),
    CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FreePackConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'FREE PACK',
    "minItems" INTEGER NOT NULL DEFAULT 3,
    "allowMixCategories" BOOLEAN NOT NULL DEFAULT true,
    "priceThreshold" REAL NOT NULL DEFAULT 150,
    "flatPrice" REAL NOT NULL DEFAULT 66.34,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FreePackConfig" ("allowMixCategories", "id", "isActive", "minItems", "name", "updatedAt") SELECT "allowMixCategories", "id", "isActive", "minItems", "name", "updatedAt" FROM "FreePackConfig";
DROP TABLE "FreePackConfig";
ALTER TABLE "new_FreePackConfig" RENAME TO "FreePackConfig";
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "detail" TEXT,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "packId" TEXT,
    "bundleId" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("detail", "id", "kind", "name", "orderId", "packId", "productId", "quantity", "unitPrice") SELECT "detail", "id", "kind", "name", "orderId", "packId", "productId", "quantity", "unitPrice" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
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
    "collectionId" TEXT NOT NULL,
    CONSTRAINT "Product_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("collectionId", "color", "createdAt", "description", "freePackEligible", "gender", "id", "images", "isActive", "isBestSeller", "isLimitedEdition", "isNew", "lowStockThreshold", "name", "notes", "notesBase", "notesHeart", "notesTop", "packEligible", "position", "price", "shape", "slug", "stock", "updatedAt", "videoUrl", "volume") SELECT "collectionId", "color", "createdAt", "description", "freePackEligible", "gender", "id", "images", "isActive", "isBestSeller", "isLimitedEdition", "isNew", "lowStockThreshold", "name", "notes", "notesBase", "notesHeart", "notesTop", "packEligible", "position", "price", "shape", "slug", "stock", "updatedAt", "videoUrl", "volume" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- Data migration: carry the old single-value "gender" into the new
-- multi-value "genders" JSON array so no existing categorization is lost.
UPDATE "Product" SET "genders" = '["' || "gender" || '"]' WHERE "gender" IS NOT NULL AND "gender" != '';
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_slug_key" ON "Bundle"("slug");
