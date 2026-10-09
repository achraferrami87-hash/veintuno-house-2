-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "notesBaseData" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "notesHeartData" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "notesTopData" TEXT NOT NULL DEFAULT '[]';

