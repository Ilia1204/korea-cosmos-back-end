-- DropIndex
DROP INDEX IF EXISTS "cart_item_user_id_product_id_key";

-- AlterTable
ALTER TABLE "cart_item" ADD COLUMN     "variation_id" INTEGER,
ADD COLUMN     "product_name" TEXT,
ADD COLUMN     "product_image" TEXT;

-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "variation_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "cart_item_user_id_product_id_variation_id_key" ON "cart_item"("user_id", "product_id", "variation_id");
