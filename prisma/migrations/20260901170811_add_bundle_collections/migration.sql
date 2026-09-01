-- CreateTable
CREATE TABLE "_BundleCollections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BundleCollections_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BundleCollections_B_index" ON "_BundleCollections"("B");

-- AddForeignKey
ALTER TABLE "_BundleCollections" ADD CONSTRAINT "_BundleCollections_A_fkey" FOREIGN KEY ("A") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BundleCollections" ADD CONSTRAINT "_BundleCollections_B_fkey" FOREIGN KEY ("B") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
