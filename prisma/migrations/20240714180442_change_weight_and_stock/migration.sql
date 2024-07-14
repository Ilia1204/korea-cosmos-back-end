/*
  Warnings:

  - You are about to drop the column `inStock` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "category" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "label_product" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "order" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "order_item" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "post" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product" DROP COLUMN "inStock",
DROP COLUMN "tags",
ADD COLUMN     "in_stock" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "weight" DROP NOT NULL,
ALTER COLUMN "price" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "review" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "section" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "updated_at" DROP DEFAULT;
