-- Ретроактивно создаём записи в loyalty_transaction для уже доставленных
-- заказов, у которых их ещё нет (таблица появилась позже, чем сами заказы,
-- поэтому история начислений у давних пользователей была бы пустой)
INSERT INTO "loyalty_transaction" ("id", "created_at", "amount", "reason", "user_id", "order_id")
SELECT
    md5(random()::text || clock_timestamp()::text || o."id") AS "id",
    o."updated_at" AS "created_at",
    (o."total_price" - o."delivery_price") AS "amount",
    'Заказ #' || upper(substring(o."id", 1, 6)) || ' доставлен' AS "reason",
    o."user_id" AS "user_id",
    o."id" AS "order_id"
FROM "order" o
WHERE o."status" = 'delivered'
  AND NOT EXISTS (
      SELECT 1 FROM "loyalty_transaction" lt WHERE lt."order_id" = o."id"
  );
