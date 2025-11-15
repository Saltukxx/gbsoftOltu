-- Migration: Add Check Constraints for Data Validation
-- This migration adds check constraints to ensure data integrity
-- Run this after applying Prisma schema changes: npx prisma migrate dev
-- Or execute manually: psql $DATABASE_URL -f prisma/migrations/add_check_constraints.sql

-- FuelReport constraints
ALTER TABLE fuel_reports
  ADD CONSTRAINT fuel_reports_consumption_liters_check 
    CHECK (consumption_liters >= 0);

ALTER TABLE fuel_reports
  ADD CONSTRAINT fuel_reports_prediction_liters_check 
    CHECK (prediction_liters IS NULL OR prediction_liters >= 0);

ALTER TABLE fuel_reports
  ADD CONSTRAINT fuel_reports_cost_per_liter_check 
    CHECK (cost_per_liter IS NULL OR cost_per_liter >= 0);

ALTER TABLE fuel_reports
  ADD CONSTRAINT fuel_reports_total_cost_check 
    CHECK (total_cost IS NULL OR total_cost >= 0);

ALTER TABLE fuel_reports
  ADD CONSTRAINT fuel_reports_efficiency_check 
    CHECK (efficiency IS NULL OR efficiency > 0);

-- VehicleLocation constraints (GPS coordinates validation)
ALTER TABLE vehicle_locations
  ADD CONSTRAINT vehicle_locations_latitude_check 
    CHECK (latitude >= -90 AND latitude <= 90);

ALTER TABLE vehicle_locations
  ADD CONSTRAINT vehicle_locations_longitude_check 
    CHECK (longitude >= -180 AND longitude <= 180);

ALTER TABLE vehicle_locations
  ADD CONSTRAINT vehicle_locations_speed_check 
    CHECK (speed IS NULL OR speed >= 0);

ALTER TABLE vehicle_locations
  ADD CONSTRAINT vehicle_locations_heading_check 
    CHECK (heading IS NULL OR (heading >= 0 AND heading < 360));

-- VehicleRoute constraints
ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_distance_km_check 
    CHECK (distance_km IS NULL OR distance_km >= 0);

ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_fuel_used_check 
    CHECK (fuel_used IS NULL OR fuel_used >= 0);

ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_start_lat_check 
    CHECK (start_lat >= -90 AND start_lat <= 90);

ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_start_lng_check 
    CHECK (start_lng >= -180 AND start_lng <= 180);

ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_end_lat_check 
    CHECK (end_lat IS NULL OR (end_lat >= -90 AND end_lat <= 90));

ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_end_lng_check 
    CHECK (end_lng IS NULL OR (end_lng >= -180 AND end_lng <= 180));

ALTER TABLE vehicle_routes
  ADD CONSTRAINT vehicle_routes_ended_at_check 
    CHECK (ended_at IS NULL OR ended_at >= started_at);

-- Shift constraints
ALTER TABLE shifts
  ADD CONSTRAINT shifts_efficiency_score_check 
    CHECK (efficiency_score IS NULL OR (efficiency_score >= 0 AND efficiency_score <= 1));

-- Employee constraints
ALTER TABLE employees
  ADD CONSTRAINT employees_performance_score_check 
    CHECK (performance_score >= 0 AND performance_score <= 5);

ALTER TABLE employees
  ADD CONSTRAINT employees_max_hours_per_week_check 
    CHECK (max_hours_per_week > 0 AND max_hours_per_week <= 168);

-- Vehicle constraints
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_fuel_capacity_check 
    CHECK (fuel_capacity > 0);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_year_check 
    CHECK (year >= 1900 AND year <= EXTRACT(YEAR FROM CURRENT_DATE) + 1);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_maintenance_dates_check 
    CHECK (
      next_maintenance_date IS NULL OR 
      last_maintenance_date IS NULL OR 
      next_maintenance_date >= last_maintenance_date
    );

-- Message constraints
ALTER TABLE messages
  ADD CONSTRAINT messages_duration_check 
    CHECK (duration IS NULL OR duration >= 0);

-- AudioAsset constraints
ALTER TABLE audio_assets
  ADD CONSTRAINT audio_assets_file_size_check 
    CHECK (file_size > 0);

ALTER TABLE audio_assets
  ADD CONSTRAINT audio_assets_duration_check 
    CHECK (duration IS NULL OR duration >= 0);

-- Comments for documentation
COMMENT ON CONSTRAINT fuel_reports_consumption_liters_check ON fuel_reports IS 
  'Ensures fuel consumption is non-negative';

COMMENT ON CONSTRAINT vehicle_locations_latitude_check ON vehicle_locations IS 
  'Validates GPS latitude is within valid range (-90 to 90)';

COMMENT ON CONSTRAINT vehicle_locations_longitude_check ON vehicle_locations IS 
  'Validates GPS longitude is within valid range (-180 to 180)';

COMMENT ON CONSTRAINT shifts_efficiency_score_check ON shifts IS 
  'Ensures efficiency score is between 0 and 1';

COMMENT ON CONSTRAINT employees_performance_score_check ON employees IS 
  'Ensures performance score is between 0 and 5';

