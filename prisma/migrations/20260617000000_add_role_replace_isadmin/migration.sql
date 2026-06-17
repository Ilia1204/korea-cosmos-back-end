-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'manager', 'admin');

-- Add role column with default 'user'
ALTER TABLE "user" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'user';

-- Migrate existing admins: is_admin = true → role = 'admin'
UPDATE "user" SET "role" = 'admin' WHERE "is_admin" = true;

-- Drop old is_admin column
ALTER TABLE "user" DROP COLUMN "is_admin";
