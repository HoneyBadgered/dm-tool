CREATE TABLE "Slug" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Slug_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Slug_kind_slug_key" ON "Slug"("kind", "slug");
CREATE UNIQUE INDEX "Slug_kind_entityId_key" ON "Slug"("kind", "entityId");
