-- Initialize database and extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS extension (optional - only needed for advanced geographic features)
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS "public";

-- Basic setup complete - Prisma will handle detailed schema