CREATE TABLE "search_query" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_query_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_query_query_key" ON "search_query"("query");
