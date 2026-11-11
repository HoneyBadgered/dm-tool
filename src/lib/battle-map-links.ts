import type {
  MapToken,
  TokenDisposition,
  TokenLink,
} from "@/lib/validation/battle-map";

export type CombatantInfo = {
  id: string;
  name: string;
  side: "party" | "enemy" | "neutral";
  status: "active" | "defeated" | "removed";
  isHidden: boolean;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;
  initiative: number | null;
  speed: number | null;
  effects: string[];
};

export type MapCombatInfo = {
  id: string;
  name: string | null;
  status: "setup" | "running" | "paused" | "ended";
  round: number;
  version: number;
  activeCombatantId: string | null;
  combatants: CombatantInfo[];
};

export type RecordInfo = {
  kind: "player_character" | "npc" | "monster";
  id: string;
  name: string;
  ac: number | null;
  maxHp: number | null;
  speed: number | null;
  detail: string | null;
  href: string;
};

export type LinkTarget = { id: string; name: string; detail: string | null };

export const linkKey = (l: TokenLink) => `${l.kind}:${l.id}`;

export function dispositionForSide(
  side: CombatantInfo["side"],
): TokenDisposition {
  return side === "party" ? "ally" : side === "enemy" ? "hostile" : "neutral";
}

export function dispositionForRecord(
  kind: RecordInfo["kind"],
): TokenDisposition {
  return kind === "player_character"
    ? "ally"
    : kind === "monster"
      ? "hostile"
      : "neutral";
}

/** First walking speed in feet from stat-block strings such as "walk: 30 ft." or "30 ft.". */
export function parseSpeedFeet(entries: string[]): number | null {
  for (const s of entries) {
    const m = /^\s*walk\s*:\s*(\d+)/i.exec(s);
    if (m) return Number(m[1]);
  }
  for (const s of entries) {
    const m = /^\s*(\d+)\s*(?:ft|feet)?\.?\s*$/i.exec(s);
    if (m) return Number(m[1]);
  }
  return null;
}

export type TokenStats = {
  source: "combatant" | RecordInfo["kind"];
  name: string;
  ac: number | null;
  hp: number | null;
  maxHp: number | null;
  tempHp: number;
  speed: number | null;
  initiative: number | null;
  effects: string[];
  isActive: boolean;
  defeated: boolean;
  combatantId: string | null;
  href: string | null;
  detail: string | null;
};

/** What the map can say about a token from its link; null when unlinked or unresolved. */
export function statsForToken(
  token: Pick<MapToken, "link">,
  combat: MapCombatInfo | null,
  records: Record<string, RecordInfo>,
): TokenStats | null {
  const link = token.link;
  if (!link) return null;
  if (link.kind === "combatant") {
    const c = combat?.combatants.find((x) => x.id === link.id);
    if (!combat || !c) return null;
    return {
      source: "combatant",
      name: c.name,
      ac: c.ac,
      hp: c.hp,
      maxHp: c.maxHp,
      tempHp: c.tempHp,
      speed: c.speed,
      initiative: c.initiative,
      effects: c.effects,
      isActive: combat.activeCombatantId === c.id,
      defeated: c.status !== "active",
      combatantId: c.id,
      href: `/combats/${combat.id}`,
      detail: `${c.side === "party" ? "Party" : c.side === "enemy" ? "Enemy" : "Neutral"} · round ${combat.round}`,
    };
  }
  const r = records[linkKey(link)];
  if (!r) return null;
  return {
    source: r.kind,
    name: r.name,
    ac: r.ac,
    hp: r.maxHp,
    maxHp: r.maxHp,
    tempHp: 0,
    speed: r.speed,
    initiative: null,
    effects: [],
    isActive: false,
    defeated: false,
    combatantId: null,
    href: r.href,
    detail: r.detail,
  };
}
