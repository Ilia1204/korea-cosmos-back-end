-- AlterTable
ALTER TABLE "group_chat_message" ADD COLUMN     "read_receipts" JSONB NOT NULL DEFAULT '{}';
