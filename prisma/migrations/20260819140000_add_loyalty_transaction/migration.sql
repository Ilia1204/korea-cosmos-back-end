-- CreateTable
CREATE TABLE "loyalty_transaction" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT,

    CONSTRAINT "loyalty_transaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
