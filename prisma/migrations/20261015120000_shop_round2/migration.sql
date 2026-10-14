-- CreateEnum
CREATE TYPE "ShopRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShopCouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "ShopReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ShopReturnStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "ShopOrderStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "ShopProduct" ADD COLUMN     "related" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "translations" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ShopFormat" ADD COLUMN     "bundleItems" JSONB,
ADD COLUMN     "priceTiers" JSONB;

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'de',
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingTaxBp" INTEGER,
ADD COLUMN     "trackingCarrier" TEXT,
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingUrl" TEXT;

-- AlterTable
ALTER TABLE "ShopOrderItem" ADD COLUMN     "bundleItems" JSONB,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShopCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShopCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ShopInvoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ShopInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "restock" BOOLEAN NOT NULL DEFAULT false,
    "status" "ShopRefundStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "error" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "userId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ShopCouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderCents" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCouponUse" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCouponUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopReservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" "ShopReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopDigitalFile" (
    "id" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopDigitalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopDownloadToken" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopWishlistItem" (
    "memberId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopWishlistItem_pkey" PRIMARY KEY ("memberId","productId")
);

-- CreateTable
CREATE TABLE "ShopStockAlert" (
    "id" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "confirmToken" TEXT NOT NULL,
    "unsubscribeToken" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopStockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "status" "ShopReturnStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopInvoice_orderId_key" ON "ShopInvoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopInvoice_number_key" ON "ShopInvoice"("number");

-- CreateIndex
CREATE INDEX "ShopRefund_orderId_idx" ON "ShopRefund"("orderId");

-- CreateIndex
CREATE INDEX "ShopOrderEvent_orderId_createdAt_idx" ON "ShopOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCoupon_code_key" ON "ShopCoupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCouponUse_orderId_key" ON "ShopCouponUse"("orderId");

-- CreateIndex
CREATE INDEX "ShopCouponUse_couponId_idx" ON "ShopCouponUse"("couponId");

-- CreateIndex
CREATE INDEX "ShopReservation_formatId_status_expiresAt_idx" ON "ShopReservation"("formatId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ShopReservation_orderId_idx" ON "ShopReservation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDigitalFile_storedName_key" ON "ShopDigitalFile"("storedName");

-- CreateIndex
CREATE INDEX "ShopDigitalFile_formatId_idx" ON "ShopDigitalFile"("formatId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDownloadToken_token_key" ON "ShopDownloadToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDownloadToken_orderId_fileId_key" ON "ShopDownloadToken"("orderId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopStockAlert_confirmToken_key" ON "ShopStockAlert"("confirmToken");

-- CreateIndex
CREATE UNIQUE INDEX "ShopStockAlert_unsubscribeToken_key" ON "ShopStockAlert"("unsubscribeToken");

-- CreateIndex
CREATE UNIQUE INDEX "ShopStockAlert_formatId_email_key" ON "ShopStockAlert"("formatId", "email");

-- CreateIndex
CREATE INDEX "ShopReturnRequest_orderId_idx" ON "ShopReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ShopReturnRequest_status_createdAt_idx" ON "ShopReturnRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_accessToken_key" ON "ShopOrder"("accessToken");

-- AddForeignKey
ALTER TABLE "ShopInvoice" ADD CONSTRAINT "ShopInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRefund" ADD CONSTRAINT "ShopRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderEvent" ADD CONSTRAINT "ShopOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopCouponUse" ADD CONSTRAINT "ShopCouponUse_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "ShopCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopReservation" ADD CONSTRAINT "ShopReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopDigitalFile" ADD CONSTRAINT "ShopDigitalFile_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "ShopFormat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopDownloadToken" ADD CONSTRAINT "ShopDownloadToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopDownloadToken" ADD CONSTRAINT "ShopDownloadToken_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ShopDigitalFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopWishlistItem" ADD CONSTRAINT "ShopWishlistItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopWishlistItem" ADD CONSTRAINT "ShopWishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopStockAlert" ADD CONSTRAINT "ShopStockAlert_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "ShopFormat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopReturnRequest" ADD CONSTRAINT "ShopReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

