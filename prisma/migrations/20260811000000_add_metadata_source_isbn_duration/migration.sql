-- AlterTable
ALTER TABLE "audiobooks" ADD COLUMN "metadata_source" TEXT NOT NULL DEFAULT 'audible';
ALTER TABLE "audiobooks" ADD COLUMN "isbn" TEXT;
ALTER TABLE "audiobooks" ADD COLUMN "duration_minutes" INTEGER;
