-- Portail client par QR code

-- Origine des bons (personnel / client), serveur facultatif pour les commandes client
CREATE TYPE "OrderSource" AS ENUM ('STAFF', 'CUSTOMER');
ALTER TABLE "Order" ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'STAFF';
ALTER TABLE "Order" ALTER COLUMN "serverId" DROP NOT NULL;

-- Jeton secret du QR code (généré pour les tables existantes), demandes en attente
ALTER TABLE "Table" ADD COLUMN "qrToken" TEXT;
UPDATE "Table" SET "qrToken" = gen_random_uuid()::text WHERE "qrToken" IS NULL;
ALTER TABLE "Table" ALTER COLUMN "qrToken" SET NOT NULL;
CREATE UNIQUE INDEX "Table_qrToken_key" ON "Table"("qrToken");
ALTER TABLE "Table" ADD COLUMN "callRequestedAt" TIMESTAMP(3);
ALTER TABLE "Table" ADD COLUMN "billRequestedAt" TIMESTAMP(3);

-- Avis clients
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "orderId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "language" "Language" NOT NULL DEFAULT 'FR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");
ALTER TABLE "Review" ADD CONSTRAINT "Review_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Journal d'audit : régénération d'un QR code
ALTER TYPE "AuditAction" ADD VALUE 'TABLE_QR_REGENERATED';
