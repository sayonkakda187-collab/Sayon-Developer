-- CreateTable
CREATE TABLE "DailyView" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "articleId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyView_date_idx" ON "DailyView"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyView_articleId_date_key" ON "DailyView"("articleId", "date");

-- AddForeignKey
ALTER TABLE "DailyView" ADD CONSTRAINT "DailyView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
