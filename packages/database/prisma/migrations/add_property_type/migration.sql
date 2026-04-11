-- CreateEnum PropertyType
CREATE TYPE "PropertyType" AS ENUM ('apartment', 'house', 'studio', 'land');

-- AlterTable Property
ALTER TABLE "Property" ADD COLUMN "propertyType" "PropertyType" NOT NULL DEFAULT 'apartment';
