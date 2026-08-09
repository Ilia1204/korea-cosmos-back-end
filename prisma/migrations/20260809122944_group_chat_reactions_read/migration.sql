-- AlterTable
ALTER TABLE "group_chat_message" ADD COLUMN     "read_by_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "group_chat_message_reaction" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "group_chat_message_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_chat_message_reaction_message_id_user_id_emoji_key" ON "group_chat_message_reaction"("message_id", "user_id", "emoji");

-- AddForeignKey
ALTER TABLE "group_chat_message_reaction" ADD CONSTRAINT "group_chat_message_reaction_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "group_chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

