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
    "perfumePrice" REAL NOT NULL DEFAULT 66.34,
    "gelDouchePrice" REAL NOT NULL DEFAULT 79,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FreePackConfig" ("allowMixCategories", "flatPrice", "id", "isActive", "minItems", "name", "priceThreshold", "updatedAt") SELECT "allowMixCategories", "flatPrice", "id", "isActive", "minItems", "name", "priceThreshold", "updatedAt" FROM "FreePackConfig";
DROP TABLE "FreePackConfig";
ALTER TABLE "new_FreePackConfig" RENAME TO "FreePackConfig";
CREATE TABLE "new_SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whatsappNumber" TEXT,
    "instagramLink" TEXT,
    "instagramQrImage" TEXT,
    "perfumeDisclaimer" TEXT NOT NULL DEFAULT 'Inspiré des plus grands parfums — non affilié aux marques citées.',
    "defaultTheme" TEXT NOT NULL DEFAULT 'clair',
    "announcementText" TEXT NOT NULL DEFAULT 'Livraison offerte partout au Maroc',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SiteSettings" ("defaultTheme", "id", "instagramLink", "instagramQrImage", "perfumeDisclaimer", "updatedAt", "whatsappNumber") SELECT "defaultTheme", "id", "instagramLink", "instagramQrImage", "perfumeDisclaimer", "updatedAt", "whatsappNumber" FROM "SiteSettings";
DROP TABLE "SiteSettings";
ALTER TABLE "new_SiteSettings" RENAME TO "SiteSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
