-- CreateEnum
CREATE TYPE "EnumUserSource" AS ENUM ('app', 'site', 'retail');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "source" "EnumUserSource" NOT NULL DEFAULT 'app';
