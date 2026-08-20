-- DropOldUniqueConstraint
DROP INDEX IF EXISTS "woo_review_user_id_woo_product_id_key";

-- AddColumn
ALTER TABLE "woo_review" ADD COLUMN "order_id" TEXT;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "woo_review_order_id_woo_product_id_key" ON "woo_review"("order_id", "woo_product_id");
