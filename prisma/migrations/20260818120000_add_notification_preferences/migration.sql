-- AlterTable
ALTER TABLE "user" ADD COLUMN "notification_preferences" JSONB NOT NULL DEFAULT '{}';
