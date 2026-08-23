-- AddColumn (defaults to true so existing users are grandfathered as verified)
ALTER TABLE "user" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true;

-- New rows should default to unverified; Prisma sets this explicitly on create,
-- this only affects direct SQL inserts that skip the column.
ALTER TABLE "user" ALTER COLUMN "email_verified" SET DEFAULT false;
