CREATE TYPE "RuleImportMode" AS ENUM ('preview', 'import', 'sync');
CREATE TYPE "RuleImportStatus" AS ENUM ('running', 'completed', 'partial', 'failed');

ALTER TABLE "RuleImportRun"
    ALTER COLUMN "mode" TYPE "RuleImportMode"
    USING "mode"::"RuleImportMode";

ALTER TABLE "RuleImportRun"
    ALTER COLUMN "status" TYPE "RuleImportStatus"
    USING "status"::"RuleImportStatus";
