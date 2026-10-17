import { describe, expect, it } from "vitest";
import { encounterEntryInputSchema } from "@/lib/validation/combat";
import { parseEntryPatch, parseNewEntry } from "./entry-form";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

describe("parseNewEntry", () => {
  it("builds a valid monster entry using the default label", () => {
    const input = parseNewEntry(
      "monster",
      form({
        ruleEntryId: "r1",
        defaultLabel: "Goblin",
        quantity: "3",
        label: "",
      }),
    );
    expect(encounterEntryInputSchema.parse(input)).toMatchObject({
      label: "Goblin",
      quantity: 3,
      hpMode: "average",
    });
  });

  it("prefers the typed display name and blank overrides stay unset", () => {
    const input = parseNewEntry(
      "monster",
      form({
        ruleEntryId: "r1",
        defaultLabel: "Guard",
        label: "Bakery Guard",
        maxHp: "",
        notes: "",
      }),
    );
    expect(input.label).toBe("Bakery Guard");
    expect(input.overrides).toBeNull();
  });

  it("forces manual HP for custom, player and stat-less NPC entries", () => {
    expect(
      parseNewEntry(
        "custom",
        form({ label: "x", maxHp: "9", armorClass: "10" }),
      ).hpMode,
    ).toBe("manual");
    expect(
      parseNewEntry(
        "player_character",
        form({ playerCharacterId: "p", quantity: "4" }),
      ),
    ).toMatchObject({
      hpMode: "manual",
      quantity: 1,
    });
    expect(parseNewEntry("npc", form({ npcId: "n", label: "x" })).hpMode).toBe(
      "manual",
    );
  });

  it("keeps non-numeric input so validation can reject it", () => {
    const input = parseNewEntry(
      "custom",
      form({ label: "x", maxHp: "abc", armorClass: "10" }),
    );
    expect(encounterEntryInputSchema.safeParse(input).success).toBe(false);
  });

  it("reads the hidden checkbox and wave", () => {
    const input = parseNewEntry(
      "custom",
      form({
        label: "x",
        maxHp: "5",
        armorClass: "10",
        startsHidden: "on",
        wave: "2",
      }),
    );
    expect(input).toMatchObject({ startsHidden: true, wave: 2 });
  });
});

describe("parseEntryPatch", () => {
  it("replaces overrides and never lets a player have copies", () => {
    expect(
      parseEntryPatch(
        "player_character",
        form({ quantity: "5", label: "Aria" }),
      ),
    ).toMatchObject({
      quantity: 1,
      overrides: null,
    });
    expect(
      parseEntryPatch("monster", form({ hpMode: "rolled", maxHp: "40" })),
    ).toMatchObject({
      hpMode: "rolled",
      overrides: { maxHp: 40 },
    });
  });
});
