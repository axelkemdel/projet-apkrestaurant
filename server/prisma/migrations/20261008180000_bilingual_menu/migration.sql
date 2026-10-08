-- Module 5 : carte et bons bilingues (FR / EN).
-- Renommages explicites (et non DROP + ADD) pour conserver les données existantes ;
-- les libellés anglais sont initialisés avec le français, à compléter dans le tableau de bord.

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('FR', 'EN');

-- Catégories
ALTER TABLE "Category" RENAME COLUMN "name" TO "nameFr";
ALTER INDEX "Category_name_key" RENAME TO "Category_nameFr_key";
ALTER TABLE "Category" ADD COLUMN "nameEn" TEXT;
UPDATE "Category" SET "nameEn" = "nameFr";
ALTER TABLE "Category" ALTER COLUMN "nameEn" SET NOT NULL;

-- Plats
ALTER TABLE "MenuItem" RENAME COLUMN "name" TO "nameFr";
ALTER TABLE "MenuItem" RENAME COLUMN "description" TO "descriptionFr";
ALTER TABLE "MenuItem" ADD COLUMN "nameEn" TEXT, ADD COLUMN "descriptionEn" TEXT;
UPDATE "MenuItem" SET "nameEn" = "nameFr", "descriptionEn" = "descriptionFr";
ALTER TABLE "MenuItem" ALTER COLUMN "nameEn" SET NOT NULL;

-- Bons
ALTER TABLE "Order" ADD COLUMN "language" "Language" NOT NULL DEFAULT 'FR';

-- Lignes de bon (copie figée)
ALTER TABLE "OrderItem" RENAME COLUMN "name" TO "nameFr";
ALTER TABLE "OrderItem" ADD COLUMN "nameEn" TEXT;
UPDATE "OrderItem" SET "nameEn" = "nameFr";
ALTER TABLE "OrderItem" ALTER COLUMN "nameEn" SET NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "quickNotes" TEXT[] DEFAULT ARRAY[]::TEXT[];
