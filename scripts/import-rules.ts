import { existsSync } from "node:fs";
import {
  isRuleCollection,
  RULE_COLLECTIONS,
  type RuleCollection,
} from "@/server/services/rules/api";
import {
  runRulesImport,
  type RuleImportMode,
} from "@/server/services/rules/ingest";
import { getDb } from "@/lib/db/client";

if (existsSync(".env")) process.loadEnvFile(".env");

function readArguments(args: string[]): {
  mode: RuleImportMode;
  collections: RuleCollection[];
} {
  let mode: RuleImportMode = "preview";
  const collections: RuleCollection[] = [];
  let confirmed = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--mode") {
      const value = args[index + 1];
      if (value !== "preview" && value !== "import" && value !== "sync") {
        throw new Error("--mode must be preview, import, or sync.");
      }
      mode = value;
      index += 1;
    } else if (argument === "--collection") {
      const value = args[index + 1];
      if (!value || !isRuleCollection(value)) {
        throw new Error(
          `--collection must be one of: ${RULE_COLLECTIONS.join(", ")}.`,
        );
      }
      collections.push(value);
      index += 1;
    } else if (argument === "--confirm") {
      confirmed = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (mode !== "preview" && !confirmed) {
    throw new Error(
      `Mode "${mode}" writes to the database. Add --confirm to continue.`,
    );
  }
  if (new Set(collections).size !== collections.length) {
    throw new Error("Pass each --collection at most once.");
  }
  return {
    mode,
    collections: collections.length > 0 ? collections : [...RULE_COLLECTIONS],
  };
}

async function main(): Promise<void> {
  const { mode, collections } = readArguments(process.argv.slice(2));
  const db = getDb();
  try {
    const report = await runRulesImport({ mode, collections, db });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "completed") process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    `Rules importer failed: ${error instanceof Error ? error.message : "Unknown error."}`,
  );
  process.exitCode = 1;
});
