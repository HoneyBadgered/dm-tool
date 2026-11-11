import { describe, expect, it } from "vitest";
import { parseAuthEnv, parseServerEnv } from "./env";

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

describe("parseAuthEnv", () => {
  it("falls back to a development secret outside production", () => {
    expect(parseAuthEnv({}).secret.length).toBeGreaterThanOrEqual(32);
  });

  it("requires a real secret in production", () => {
    expect(() => parseAuthEnv({ NODE_ENV: "production" })).toThrow();
    expect(() =>
      parseAuthEnv({ NODE_ENV: "production", BETTER_AUTH_SECRET: "short" }),
    ).toThrow();
  });

  it("accepts a long secret in production", () => {
    const secret = "x".repeat(40);
    expect(
      parseAuthEnv({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret })
        .secret,
    ).toBe(secret);
  });
});
