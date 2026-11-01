-- CreateEnum
CREATE TYPE "TrackerAggregation" AS ENUM ('SUM', 'AVERAGE', 'LATEST');

-- CreateEnum
CREATE TYPE "TrackerFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED');

-- CreateEnum
CREATE TYPE "TargetDirection" AS ENUM ('AT_LEAST', 'AT_MOST');

-- CreateEnum
CREATE TYPE "MarketSourceType" AS ENUM ('PUBLISHED_INDEX', 'COMPETITOR_QUOTE', 'CUSTOMER_FEEDBACK', 'BROKER', 'LOST_DEAL', 'OTHER');

-- AlterTable
ALTER TABLE "UnitOfMeasure" ADD COLUMN     "custom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Tracker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unitCode" TEXT NOT NULL,
    "aggregation" "TrackerAggregation" NOT NULL DEFAULT 'SUM',
    "frequency" "TrackerFrequency" NOT NULL DEFAULT 'DAILY',
    "target" DECIMAL(24,6),
    "targetDirection" "TargetDirection",
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "productId" TEXT,
    "locationId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackerEntry" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "at" DATE NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "enteredValue" DECIMAL(24,6) NOT NULL,
    "enteredUnit" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRate" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "grade" TEXT,
    "sourceType" "MarketSourceType" NOT NULL,
    "source" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'FOB',
    "region" TEXT,
    "price" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unitCode" TEXT NOT NULL,
    "observedAt" DATE NOT NULL,
    "validUntil" DATE,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tracker_archived_idx" ON "Tracker"("archived");

-- CreateIndex
CREATE INDEX "TrackerEntry_trackerId_at_idx" ON "TrackerEntry"("trackerId", "at");

-- CreateIndex
CREATE INDEX "MarketRate_productId_observedAt_idx" ON "MarketRate"("productId", "observedAt");

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_unitCode_fkey" FOREIGN KEY ("unitCode") REFERENCES "UnitOfMeasure"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerEntry" ADD CONSTRAINT "TrackerEntry_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerEntry" ADD CONSTRAINT "TrackerEntry_enteredUnit_fkey" FOREIGN KEY ("enteredUnit") REFERENCES "UnitOfMeasure"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRate" ADD CONSTRAINT "MarketRate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRate" ADD CONSTRAINT "MarketRate_unitCode_fkey" FOREIGN KEY ("unitCode") REFERENCES "UnitOfMeasure"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reference units for non-mass dimensions (factor to each dimension's base unit). Not business data.
INSERT INTO "UnitOfMeasure" ("code","name","toKg","dimension") VALUES
  ('G','Gram',0.001,'mass'),
  ('L','Litre',1,'volume'), ('M3','Cubic metre',1000,'volume'), ('GAL','US gallon',3.785411784,'volume'), ('BBL','Barrel (oil, 42 US gal)',158.987294928,'volume'),
  ('M','Metre',1,'length'), ('KM','Kilometre',1000,'length'), ('FT','Foot',0.3048,'length'), ('MI','Mile',1609.344,'length'),
  ('KWH','Kilowatt-hour',1,'energy'), ('MWH','Megawatt-hour',1000,'energy'), ('MMBTU','Million BTU',293.0710701722,'energy'), ('THERM','Therm',29.30710701722,'energy'),
  ('H','Hour',1,'time'), ('MIN','Minute',0.0166666666666667,'time'), ('DAY','Day',24,'time'),
  ('EA','Each',1,'count'), ('LOAD','Truck load',1,'count:loads'), ('CONT','Container',1,'count:containers'), ('RAIL','Railcar',1,'count:railcars'),
  ('PCT','Percent',1,'percent'), ('PPM','Parts per million',0.0001,'percent'),
  ('USD','US dollar',1,'currency:USD')
ON CONFLICT ("code") DO NOTHING;

-- Grant the new tracking permission to roles that have customised permission rows.
INSERT INTO "RolePermission" ("role","permission")
  SELECT DISTINCT "role", 'tracking.use' FROM "RolePermission" ON CONFLICT DO NOTHING;
