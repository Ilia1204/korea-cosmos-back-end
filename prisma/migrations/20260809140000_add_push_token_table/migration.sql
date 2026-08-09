-- CreateTable
CREATE TABLE "push_token" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "push_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_token_token_key" ON "push_token"("token");

-- AddForeignKey
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single tokens into the new table
INSERT INTO "push_token" ("id", "created_at", "updated_at", "token", "user_id")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "created_at", now(), "push_token", "id"
FROM "user"
WHERE "push_token" IS NOT NULL AND "push_token" != ''
ON CONFLICT ("token") DO NOTHING;
