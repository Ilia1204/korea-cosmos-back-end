/*
  Warnings:

  - You are about to drop the column `image_path` on the `review` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "post" ADD COLUMN     "count_likes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likes_ids_users" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "product" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "review" DROP COLUMN "image_path",
ADD COLUMN     "images" TEXT[];

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "avatar_path" SET DEFAULT '/uploads/default/default-avatar.jpg';
