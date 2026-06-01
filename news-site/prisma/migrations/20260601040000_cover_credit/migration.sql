-- Optional stock-photo attribution for article covers (Pexels photographer credit).
ALTER TABLE "Article" ADD COLUMN "coverCredit" TEXT;
ALTER TABLE "Article" ADD COLUMN "coverCreditUrl" TEXT;
