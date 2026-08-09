-- CreateTable
CREATE TABLE "group_chat_room" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Командный чат',
    "pinned_message_id" TEXT,

    CONSTRAINT "group_chat_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_participant" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "group_chat_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_message" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "room_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "audio_url" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "file_type" TEXT,
    "file_size" INTEGER,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "reply_to_id" TEXT,

    CONSTRAINT "group_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_chat_participant_room_id_user_id_key" ON "group_chat_participant"("room_id", "user_id");

-- AddForeignKey
ALTER TABLE "group_chat_room" ADD CONSTRAINT "group_chat_room_pinned_message_id_fkey" FOREIGN KEY ("pinned_message_id") REFERENCES "group_chat_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_participant" ADD CONSTRAINT "group_chat_participant_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "group_chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_participant" ADD CONSTRAINT "group_chat_participant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_message" ADD CONSTRAINT "group_chat_message_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "group_chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_message" ADD CONSTRAINT "group_chat_message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_message" ADD CONSTRAINT "group_chat_message_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "group_chat_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

