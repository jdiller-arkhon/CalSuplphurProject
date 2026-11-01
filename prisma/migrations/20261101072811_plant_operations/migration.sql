-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "berth" TEXT,
ADD COLUMN     "containerCount" INTEGER,
ADD COLUMN     "truckId" TEXT;

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plate" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "truckId" TEXT,
    "vehicleRef" TEXT,
    "driver" TEXT,
    "grossKg" DECIMAL(14,3) NOT NULL,
    "tareKg" DECIMAL(14,3) NOT NULL,
    "netKg" DECIMAL(14,3) NOT NULL,
    "netQty" DECIMAL(20,6) NOT NULL,
    "shipmentId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,

    CONSTRAINT "ScaleTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "inputLotId" TEXT NOT NULL,
    "inputQty" DECIMAL(20,6) NOT NULL,
    "outputProductId" TEXT NOT NULL,
    "outputLocationId" TEXT NOT NULL,
    "outputLotNumber" TEXT NOT NULL,
    "outputQty" DECIMAL(20,6) NOT NULL,
    "processingCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "outputUnitCost" DECIMAL(18,4) NOT NULL,
    "yieldPct" DECIMAL(9,6) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselLoadDay" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "VesselLoadDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Truck_code_key" ON "Truck"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleTicket_number_key" ON "ScaleTicket"("number");

-- CreateIndex
CREATE INDEX "ScaleTicket_at_idx" ON "ScaleTicket"("at");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRun_number_key" ON "ProductionRun"("number");

-- CreateIndex
CREATE UNIQUE INDEX "VesselLoadDay_shipmentId_day_key" ON "VesselLoadDay"("shipmentId", "day");

-- AddForeignKey
ALTER TABLE "ScaleTicket" ADD CONSTRAINT "ScaleTicket_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleTicket" ADD CONSTRAINT "ScaleTicket_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselLoadDay" ADD CONSTRAINT "VesselLoadDay_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
