CREATE TYPE "RuleEntryOrigin" AS ENUM ('imported', 'homebrew');

CREATE TABLE "RuleSource" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiEdition" TEXT NOT NULL,
    "apiBaseUrl" TEXT NOT NULL,
    "srdLabel" TEXT NOT NULL,
    "verifiedSrdRevision" TEXT,
    "licenseName" TEXT NOT NULL,
    "licenseUrl" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleEntry" (
    "id" TEXT NOT NULL,
    "origin" "RuleEntryOrigin" NOT NULL,
    "category" TEXT NOT NULL,
    "sourceKey" TEXT,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "contentHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RuleEntry_origin_source_check" CHECK (
        ("origin" = 'imported' AND "sourceId" IS NOT NULL AND "sourceKey" IS NOT NULL AND "contentHash" IS NOT NULL)
        OR
        ("origin" = 'homebrew' AND "sourceId" IS NULL AND "sourceKey" IS NULL)
    )
);

CREATE TABLE "RuleImportRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "collection" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "writesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "valid" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "summary" TEXT,

    CONSTRAINT "RuleImportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RuleSource_provider_apiEdition_key" ON "RuleSource"("provider", "apiEdition");
CREATE UNIQUE INDEX "RuleEntry_sourceId_category_sourceKey_key" ON "RuleEntry"("sourceId", "category", "sourceKey");
CREATE INDEX "RuleEntry_category_isActive_name_idx" ON "RuleEntry"("category", "isActive", "name");
CREATE INDEX "RuleEntry_origin_isActive_idx" ON "RuleEntry"("origin", "isActive");
CREATE INDEX "RuleImportRun_sourceId_startedAt_idx" ON "RuleImportRun"("sourceId", "startedAt");

ALTER TABLE "RuleEntry"
    ADD CONSTRAINT "RuleEntry_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "RuleSource"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RuleImportRun"
    ADD CONSTRAINT "RuleImportRun_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "RuleSource"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
