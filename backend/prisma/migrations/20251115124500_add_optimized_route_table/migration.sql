-- CreateEnum
CREATE TYPE "OptimizationAlgorithm" AS ENUM ('NEAREST_NEIGHBOR', 'GENETIC_ALGORITHM', 'ANT_COLONY_OPTIMIZATION', 'HYBRID');

-- CreateEnum
CREATE TYPE "OptimizationPattern" AS ENUM ('NONE', 'SPIRAL', 'GRID', 'BACK_AND_FORTH', 'PERIMETER_FIRST', 'TSP_OPTIMAL');

-- CreateTable
CREATE TABLE "optimized_routes" (
    "id" TEXT NOT NULL,
    "vehicleRouteId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "algorithm" "OptimizationAlgorithm" NOT NULL,
    "pattern" "OptimizationPattern" NOT NULL DEFAULT 'NONE',
    "algorithmParameters" JSONB,
    "originalDistance" DOUBLE PRECISION,
    "originalTime" DOUBLE PRECISION,
    "originalFuelCost" DOUBLE PRECISION,
    "optimizedDistance" DOUBLE PRECISION NOT NULL,
    "optimizedTime" DOUBLE PRECISION NOT NULL,
    "optimizedFuelCost" DOUBLE PRECISION NOT NULL,
    "distanceSavings" DOUBLE PRECISION,
    "distanceSavingsPercent" DOUBLE PRECISION,
    "timeSavings" DOUBLE PRECISION,
    "timeSavingsPercent" DOUBLE PRECISION,
    "fuelSavings" DOUBLE PRECISION,
    "fuelSavingsPercent" DOUBLE PRECISION,
    "optimizedPath" JSONB NOT NULL,
    "waypoints" JSONB,
    "optimizationTimeMs" INTEGER,
    "numberOfStops" INTEGER NOT NULL,
    "isApplied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "optimized_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "optimized_routes_vehicleId_createdAt_idx" ON "optimized_routes"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "optimized_routes_vehicleRouteId_idx" ON "optimized_routes"("vehicleRouteId");

-- CreateIndex
CREATE INDEX "optimized_routes_algorithm_idx" ON "optimized_routes"("algorithm");

-- CreateIndex
CREATE INDEX "optimized_routes_isApplied_idx" ON "optimized_routes"("isApplied");

-- AddForeignKey
ALTER TABLE "optimized_routes" ADD CONSTRAINT "optimized_routes_vehicleRouteId_fkey" FOREIGN KEY ("vehicleRouteId") REFERENCES "vehicle_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimized_routes" ADD CONSTRAINT "optimized_routes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
