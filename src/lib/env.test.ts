import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("requires DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow();
  });

  it("returns DATABASE_URL when present", () => {
    expect(
      parseServerEnv({ DATABASE_URL: "postgresql://x" }).DATABASE_URL,
    ).toBe("postgresql://x");
  });
});
