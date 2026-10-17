import type { CreatureKindValue as Kind } from "@/lib/validation/combat";

function text(fd: FormData, key: string): string | undefined {
  const value = fd.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// Non-numeric text is passed through so validation reports it instead of dropping it.
function integer(fd: FormData, key: string): number | string | undefined {
  const value = text(fd, key);
  if (value === undefined) return undefined;
  return /^-?\d+$/.test(value) ? Number(value) : value;
}

function overrides(fd: FormData): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const maxHp = integer(fd, "maxHp");
  const armorClass = integer(fd, "armorClass");
  const initiativeModifier = integer(fd, "initiativeModifier");
  const notes = text(fd, "notes");
  if (maxHp !== undefined) result.maxHp = maxHp;
  if (armorClass !== undefined) result.armorClass = armorClass;
  if (initiativeModifier !== undefined)
    result.initiativeModifier = initiativeModifier;
  if (notes !== undefined) result.notes = notes;
  return Object.keys(result).length > 0 ? result : null;
}

function common(fd: FormData) {
  return {
    label: text(fd, "label") ?? text(fd, "defaultLabel"),
    quantity: integer(fd, "quantity") ?? 1,
    side: text(fd, "side") ?? null,
    wave: integer(fd, "wave") ?? 0,
    startsHidden: fd.get("startsHidden") === "on",
    overrides: overrides(fd),
  };
}

/** Builds the input for a new entry. Kinds without library stats are always manual HP. */
export function parseNewEntry(kind: Kind, fd: FormData) {
  const base = common(fd);
  switch (kind) {
    case "monster":
      return {
        ...base,
        kind,
        ruleEntryId: text(fd, "ruleEntryId"),
        hpMode: text(fd, "hpMode") ?? "average",
      };
    case "npc":
      return {
        ...base,
        kind,
        npcId: text(fd, "npcId"),
        ruleEntryId: text(fd, "ruleEntryId") ?? null,
        hpMode: text(fd, "ruleEntryId")
          ? (text(fd, "hpMode") ?? "average")
          : "manual",
      };
    case "player_character":
      return {
        ...base,
        kind,
        playerCharacterId: text(fd, "playerCharacterId"),
        quantity: 1,
        hpMode: "manual",
      };
    case "custom":
      return { ...base, kind, hpMode: "manual" };
  }
}

/** Builds a full-replacement patch for an existing entry. */
export function parseEntryPatch(kind: Kind, fd: FormData) {
  const base = common(fd);
  const patch: Record<string, unknown> = {
    label: base.label,
    quantity: kind === "player_character" ? 1 : base.quantity,
    side: base.side,
    wave: base.wave,
    startsHidden: base.startsHidden,
    overrides: base.overrides,
  };
  const hpMode = text(fd, "hpMode");
  if (hpMode) patch.hpMode = hpMode;
  return patch;
}
