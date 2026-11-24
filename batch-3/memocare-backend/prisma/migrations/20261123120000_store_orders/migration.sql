-- Carts that customers book against one medical store. Each order is also
-- announced to that store's owner as a notification.
CREATE TYPE "StoreOrderStatus" AS ENUM ('PLACED', 'READY', 'COMPLETED', 'CANCELLED');

CREATE TABLE "StoreOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "notes" TEXT,
    "total" DOUBLE PRECISION NOT NULL,
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'PLACED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "medicineId" TEXT,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "StoreOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreOrder_storeId_createdAt_idx" ON "StoreOrder"("storeId", "createdAt");
CREATE INDEX "StoreOrder_customerId_createdAt_idx" ON "StoreOrder"("customerId", "createdAt");
CREATE INDEX "StoreOrderItem_orderId_idx" ON "StoreOrderItem"("orderId");

ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "MedicalStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
