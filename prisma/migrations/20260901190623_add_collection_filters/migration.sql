-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "showFilter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showSearch" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "filterOptionIds" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "CollectionFilterOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "collectionId" TEXT NOT NULL,

    CONSTRAINT "CollectionFilterOption_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CollectionFilterOption" ADD CONSTRAINT "CollectionFilterOption_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
