import { getDb } from "@/lib/db/client";
import { RECORD_KIND_LABELS, idSchema } from "@/lib/validation/board";
import { BoardNotFoundError, type BoardDb } from "./boards";

export type LinkableItem = {
  type: string;
  id: string;
  label: string;
  group: string;
};

export type NodeDetail = {
  title: string;
  kindLabel: string;
  fields: { label: string; value: string }[];
  body: string | null;
  href: string | null;
  recordId: string | null;
  missing: boolean;
};

/** Everything in the board's campaign that can become a card. */
export async function listLinkable(
  boardId: string,
  db: BoardDb = getDb(),
): Promise<LinkableItem[]> {
  const board = await db.board.findFirst({
    where: { id: idSchema.parse(boardId), deletedAt: null },
    select: { campaignId: true },
  });
  if (!board) throw new BoardNotFoundError(boardId);
  const where = { campaignId: board.campaignId, deletedAt: null };
  const [npcs, pcs, sessions, encounters, combats, records] = await Promise.all(
    [
      db.npc.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.playerCharacter.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.session.findMany({
        where: { campaignId: board.campaignId },
        orderBy: { number: "asc" },
        select: { id: true, number: true, title: true },
      }),
      db.encounter.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true },
      }),
      db.combat.findMany({
        where: { campaignId: board.campaignId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          encounter: { select: { title: true } },
        },
      }),
      db.storyRecord.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      }),
    ],
  );
  return [
    ...npcs.map((n) => ({
      type: "npc",
      id: n.id,
      label: n.name,
      group: "NPCs",
    })),
    ...pcs.map((p) => ({
      type: "player_character",
      id: p.id,
      label: p.name,
      group: "Player characters",
    })),
    ...sessions.map((s) => ({
      type: "session",
      id: s.id,
      label: `Session ${s.number}${s.title ? `: ${s.title}` : ""}`,
      group: "Sessions",
    })),
    ...encounters.map((e) => ({
      type: "encounter",
      id: e.id,
      label: e.title,
      group: "Encounters",
    })),
    ...combats.map((c) => ({
      type: "combat",
      id: c.id,
      label: `${c.name || (c.encounter ? `Combat: ${c.encounter.title}` : "Combat")} (${c.status})`,
      group: "Combats",
    })),
    ...records.map((r) => ({
      type: `record:${r.kind}`,
      id: r.id,
      label: r.name,
      group: `${RECORD_KIND_LABELS[r.kind]}s`,
    })),
  ];
}

function present(label: string, value: unknown) {
  return value === null || value === undefined || value === ""
    ? []
    : [{ label, value: String(value) }];
}

/** Full record for the side drawer, always scoped to the board's campaign. */
export async function getNodeDetail(
  boardId: string,
  nodeId: string,
  db: BoardDb = getDb(),
): Promise<NodeDetail | null> {
  const node = await db.boardNode.findFirst({
    where: {
      id: idSchema.parse(nodeId),
      boardId: idSchema.parse(boardId),
      board: { deletedAt: null },
    },
    include: {
      board: { select: { campaignId: true } },
      npc: true,
      playerCharacter: true,
      session: true,
      encounter: {
        include: { entries: { select: { label: true, quantity: true } } },
      },
      combat: {
        include: {
          encounter: { select: { title: true } },
          combatants: { select: { isHidden: true } },
        },
      },
      record: true,
    },
  });
  if (!node) return null;
  const gone = (kindLabel: string): NodeDetail => ({
    title: "Missing record",
    kindLabel,
    fields: [],
    body: "The linked record was deleted. Remove this card or restore the record.",
    href: null,
    recordId: null,
    missing: true,
  });

  if (node.kind === "note")
    return {
      title: node.title ?? "Note",
      kindLabel: "Note",
      fields: [],
      body: node.text,
      href: null,
      recordId: null,
      missing: false,
    };
  if (node.npcId) {
    const n = node.npc;
    if (!n || n.deletedAt) return gone("NPC");
    return {
      title: n.name,
      kindLabel: "NPC",
      fields: [
        ...present("Role", n.role),
        ...present("Race", n.race),
        ...present("Class", n.characterClass),
        ...present("Level", n.level),
        ...present("Location", n.location),
      ],
      body: n.notes,
      href: `/npcs/${n.id}`,
      recordId: null,
      missing: false,
    };
  }
  if (node.playerCharacterId) {
    const p = node.playerCharacter;
    if (!p || p.deletedAt) return gone("Player character");
    return {
      title: p.name,
      kindLabel: "Player character",
      fields: [
        ...present("Player", p.playerName),
        ...present("Race", p.race),
        ...present("Class", p.characterClass),
        ...present("Level", p.level),
        ...present("Max HP", p.maxHp),
        ...present("AC", p.armorClass),
      ],
      body: p.notes,
      href: `/campaigns/${node.board.campaignId}`,
      recordId: null,
      missing: false,
    };
  }
  if (node.encounterId) {
    const e = node.encounter;
    if (!e || e.deletedAt) return gone("Encounter");
    return {
      title: e.title,
      kindLabel: "Encounter",
      fields: [
        ...present("Status", e.status),
        ...present("Objective", e.objective),
        ...present(
          "Creatures",
          e.entries.map((x) => `${x.quantity}× ${x.label}`).join(", "),
        ),
      ],
      body: e.notes,
      href: `/encounters/${e.id}`,
      recordId: null,
      missing: false,
    };
  }
  if (node.combatId) {
    const c = node.combat;
    if (!c) return gone("Combat");
    return {
      title:
        c.name || (c.encounter ? `Combat: ${c.encounter.title}` : "Combat"),
      kindLabel: "Combat",
      fields: [
        ...present("Status", c.status),
        ...present("Round", c.status === "setup" ? null : c.round),
        ...present("Combatants", c.combatants.length),
        ...present("Started", c.startedAt ? c.startedAt.toDateString() : null),
      ],
      body: null,
      href: `/combats/${c.id}`,
      recordId: null,
      missing: false,
    };
  }
  if (node.sessionId) {
    const s = node.session;
    if (!s) return gone("Session");
    return {
      title: `Session ${s.number}${s.title ? `: ${s.title}` : ""}`,
      kindLabel: "Session",
      fields: s.playedAt
        ? [{ label: "Played", value: s.playedAt.toDateString() }]
        : [],
      body: s.notes || null,
      href: "/story",
      recordId: null,
      missing: false,
    };
  }
  const r = node.record;
  if (!r || r.deletedAt) return gone("Record");
  return {
    title: r.name,
    kindLabel: RECORD_KIND_LABELS[r.kind],
    fields: [],
    body:
      [r.summary, r.dmNotes ? `DM notes: ${r.dmNotes}` : null]
        .filter(Boolean)
        .join("\n\n") || null,
    href: `/campaigns/${node.board.campaignId}/records?edit=${r.id}`,
    recordId: r.id,
    missing: false,
  };
}
