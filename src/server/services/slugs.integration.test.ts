import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { ensureSlug, resolveSlugParam } from "./slugs";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("url slugs (integration)", () => {
  let db: PrismaClient;

  beforeAll(() => {
    process.env.DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });

  afterAll(async () => {
    await db.slug.deleteMany({ where: { kind: "board" } });
    await db.$disconnect();
  });

  it("creates a stable slug and resolves it back to the id", async () => {
    const slug = await ensureSlug("board", "id-aaa", "The Lost Mine");
    expect(slug).toBe("the-lost-mine");
    expect(await ensureSlug("board", "id-aaa", "Renamed")).toBe(slug);
    expect(await resolveSlugParam("board", slug)).toBe("id-aaa");
  });

  it("numbers colliding names and passes unknown params through", async () => {
    expect(await ensureSlug("board", "id-bbb", "The Lost Mine")).toBe(
      "the-lost-mine-2",
    );
    expect(await resolveSlugParam("board", "cmv123")).toBe("cmv123");
  });
});
