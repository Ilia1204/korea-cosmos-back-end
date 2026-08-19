-- Пересчитываем total_amount_spent как сумму реальных транзакций из
-- loyalty_transaction (после бэкфилла эта таблица — единственный
-- достоверный источник: раньше сумма могла задваиваться из-за гонки
-- между повторным сохранением заказа, вебхуками WC/RetailCRM и
-- cron-синхронизацией RetailCRM, которые независимо триггерили начисление)
UPDATE "user_loyalty" ul
SET "total_amount_spent" = COALESCE(agg.total, 0)
FROM (
    SELECT "user_id", SUM("amount") AS total
    FROM "loyalty_transaction"
    GROUP BY "user_id"
) agg
WHERE ul."user_id" = agg."user_id";

-- у кого вообще нет ни одной транзакции — сумма обнуляется
UPDATE "user_loyalty" ul
SET "total_amount_spent" = 0
WHERE NOT EXISTS (
    SELECT 1 FROM "loyalty_transaction" lt WHERE lt."user_id" = ul."user_id"
);

-- Пересчитываем уровень и скидку под новую сумму (та же логика,
-- что и applyLevelChange в loyalty-level.service.ts)
UPDATE "user_loyalty" ul
SET "level_id" = lvl."id",
    "current_discount" = lvl."discount"
FROM LATERAL (
    SELECT "id", "discount"
    FROM "loyalty_level"
    WHERE "min_amount" <= ul."total_amount_spent"
    ORDER BY "min_amount" DESC
    LIMIT 1
) lvl;
