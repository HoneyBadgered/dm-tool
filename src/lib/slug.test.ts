import { describe, expect, it } from "vitest";
import { slugCandidate, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Lost Mine!", "board")).toBe("the-lost-mine");
  });
  it("strips accents and apostrophes", () => {
    expect(slugify("Dragon’s Café", "board")).toBe("dragons-cafe");
  });
  it("falls back when nothing usable remains", () => {
    expect(slugify("???", "map")).toBe("map");
  });
  it("avoids reserved route words", () => {
    expect(slugify("New", "npc")).toBe("new-npc");
  });
  it("caps the length without a trailing hyphen", () => {
    const slug = slugify("a ".repeat(100), "board");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugCandidate", () => {
  it("numbers duplicates from 2", () => {
    expect(slugCandidate("inn", 1)).toBe("inn");
    expect(slugCandidate("inn", 2)).toBe("inn-2");
  });
});
