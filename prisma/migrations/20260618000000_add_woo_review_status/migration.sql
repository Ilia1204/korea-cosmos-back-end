ALTER TABLE "woo_review" ADD COLUMN "woo_status" TEXT NOT NULL DEFAULT 'hold';
UPDATE "woo_review" SET "woo_status" = 'approved' WHERE "is_public" = true;
UPDATE "woo_review" SET "woo_status" = 'hold' WHERE "is_public" = false;
