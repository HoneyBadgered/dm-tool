import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  MAX_BOARD_ARCS,
  MAX_BOARD_EDGES,
  MAX_BOARD_NODES,
  boardCommands,
  boardCreateSchema,
  styleSchema,
  type BoardStyle,
  type FreeKind,
  boardRenameSchema,
  idSchema,
  type EdgeType,
  type NodeStatus,
  type RecordKind,
} from "@/lib/validation/board";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

export class BoardNotFoundError extends Error {
  constructor(id: string) {
    super(`Board not found: ${id}`);
    this.name = "BoardNotFoundError";
  }
}

export class BoardConflictError extends Error {
  constructor(
    readonly boardId: string,
    readonly expectedVersion: number,
  ) {
    super(`Board ${boardId} changed since version ${expectedVersion}`);
    this.name = "BoardConflictError";
  }
}

export class BoardRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardRuleError";
  }
}

export type BoardDb = PrismaClient;

export type NodeLink =
  | { type: "npc"; id: string; missing: boolean; label: string; href: string }
  | {
      type: "player_character";
      id: string;
      missing: boolean;
      label: string;
      href: string;
    }
  | {
      type: "session";
      id: string;
      missing: boolean;
      label: string;
      href: string;
    }
  | {
      type: "encounter" | "combat";
      id: string;
      missing: boolean;
      label: string;
      href: string;
    }
  | {
      type: "record";
      id: string;
      recordKind: RecordKind | null;
      missing: boolean;
      label: string;
      href: string;
    };

export type BoardNodeView = {
  id: string;
  kind: "record" | "note" | FreeKind;
  width: number | null;
  height: number | null;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  parentId: string | null;
  style: BoardStyle | null;
  x: number;
  y: number;
  status: NodeStatus;
  title: string | null;
  text: string | null;
  dmNote: string | null;
  arcId: string | null;
  link: NodeLink | null;
  detail: string | null;
};

export type BoardEdgeView = {
  id: string;
  style: BoardStyle | null;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  label: string | null;
};

export type BoardArcView = { id: string; name: string; color: string };

export type Viewport = { x: number; y: number; zoom: number };

export type BoardView = {
  id: string;
  campaignId: string;
  name: string;
  version: number;
  viewport: Viewport | null;
  nodes: BoardNodeView[];
  edges: BoardEdgeView[];
  arcs: BoardArcView[];
};

export type BoardSummary = {
  id: string;
  campaignId: string;
  name: string;
  updatedAt: Date;
  nodeCount: number;
};

export async function listBoards(
  campaignId: string,
  db: BoardDb = getDb(),
): Promise<BoardSummary[]> {
  const rows = await db.board.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      campaignId: true,
      name: true,
      updatedAt: true,
      _count: { select: { nodes: true } },
    },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, nodeCount: _count.nodes }));
}

export async function createBoard(
  input: unknown,
  db: BoardDb = getDb(),
): Promise<{ id: string }> {
  const { campaignId, name } = boardCreateSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!campaign) throw new CampaignNotFoundError(campaignId);
  return db.board.create({
    data: { campaignId, name },
    select: { id: true },
  });
}

export async function renameBoard(
  id: string,
  input: unknown,
  db: BoardDb = getDb(),
): Promise<void> {
  const { name } = boardRenameSchema.parse(input);
  const result = await db.board.updateMany({
    where: { id: idSchema.parse(id), deletedAt: null },
    data: { name },
  });
  if (result.count === 0) throw new BoardNotFoundError(id);
}

/** Soft delete; cards and arrows are kept but hidden with the board. */
export async function deleteBoard(
  id: string,
  db: BoardDb = getDb(),
): Promise<void> {
  const result = await db.board.updateMany({
    where: { id: idSchema.parse(id), deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new BoardNotFoundError(id);
}

function parseViewport(value: Prisma.JsonValue | null): Viewport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { x, y, zoom } = value as Record<string, unknown>;
  return typeof x === "number" &&
    typeof y === "number" &&
    typeof zoom === "number"
    ? { x, y, zoom }
    : null;
}

const MISSING = "Missing record";

function parseStyle(value: Prisma.JsonValue | null): BoardStyle | null {
  const parsed = styleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const clip = (v: string, max = 140) =>
  v.length > max ? `${v.slice(0, max).trimEnd()}…` : v;

const joinParts = (parts: (string | number | null | undefined)[]) =>
  parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");

function combatLabel(c: {
  name: string | null;
  encounter: { title: string } | null;
}) {
  return c.name || (c.encounter ? `Combat: ${c.encounter.title}` : "Combat");
}

/** One short line of context shown on the card itself. */
function cardDetail(n: {
  kind: string;
  text: string | null;
  npc: {
    deletedAt: Date | null;
    role: string | null;
    race: string | null;
    characterClass: string | null;
    level: number | null;
    location: string | null;
  } | null;
  playerCharacter: {
    deletedAt: Date | null;
    playerName: string | null;
    race: string | null;
    characterClass: string | null;
    level: number | null;
  } | null;
  session: { playedAt: Date | null } | null;
  encounter: { status: string; objective: string | null } | null;
  combat: { status: string; round: number } | null;
  record: { deletedAt: Date | null; summary: string | null } | null;
}): string | null {
  if (n.kind === "note") return n.text ? clip(n.text) : null;
  const rcl = (x: {
    race: string | null;
    characterClass: string | null;
    level: number | null;
  }) =>
    joinParts([
      x.race,
      joinParts([x.characterClass, x.level ? `Lv ${x.level}` : null]).replace(
        " · ",
        " ",
      ),
    ]);
  if (n.npc && !n.npc.deletedAt)
    return joinParts([n.npc.role, rcl(n.npc), n.npc.location]) || null;
  if (n.playerCharacter && !n.playerCharacter.deletedAt)
    return (
      joinParts([rcl(n.playerCharacter), n.playerCharacter.playerName]) || null
    );
  if (n.encounter)
    return joinParts([n.encounter.status, n.encounter.objective]) || null;
  if (n.combat)
    return n.combat.status === "setup"
      ? "Setup"
      : `${n.combat.status} · Round ${n.combat.round}`;
  if (n.session?.playedAt) return `Played ${n.session.playedAt.toDateString()}`;
  if (n.record && !n.record.deletedAt && n.record.summary)
    return clip(n.record.summary);
  return null;
}

export async function getBoard(
  id: string,
  db: BoardDb = getDb(),
): Promise<BoardView | null> {
  const board = await db.board.findFirst({
    where: { id: idSchema.parse(id), deletedAt: null },
    include: {
      nodes: {
        orderBy: { createdAt: "asc" },
        include: {
          npc: {
            select: {
              name: true,
              deletedAt: true,
              role: true,
              race: true,
              characterClass: true,
              level: true,
              location: true,
            },
          },
          playerCharacter: {
            select: {
              name: true,
              deletedAt: true,
              playerName: true,
              race: true,
              characterClass: true,
              level: true,
            },
          },
          session: { select: { number: true, title: true, playedAt: true } },
          encounter: {
            select: {
              title: true,
              status: true,
              objective: true,
              deletedAt: true,
            },
          },
          combat: {
            select: {
              name: true,
              status: true,
              round: true,
              encounter: { select: { title: true } },
            },
          },
          record: {
            select: {
              name: true,
              kind: true,
              deletedAt: true,
              summary: true,
            },
          },
        },
      },
      edges: { orderBy: { id: "asc" } },
      arcs: { orderBy: { id: "asc" } },
    },
  });
  if (!board) return null;

  const nodes: BoardNodeView[] = board.nodes.map((n) => {
    let link: NodeLink | null = null;
    if (n.kind === "record") {
      if (n.npcId) {
        const gone = !n.npc || n.npc.deletedAt !== null;
        link = {
          type: "npc",
          id: n.npcId,
          missing: gone,
          label: gone ? MISSING : n.npc!.name,
          href: `/npcs/${n.npcId}`,
        };
      } else if (n.playerCharacterId) {
        const gone = !n.playerCharacter || n.playerCharacter.deletedAt !== null;
        link = {
          type: "player_character",
          id: n.playerCharacterId,
          missing: gone,
          label: gone ? MISSING : n.playerCharacter!.name,
          href: `/campaigns/${board.campaignId}`,
        };
      } else if (n.encounterId) {
        const gone = !n.encounter || n.encounter.deletedAt !== null;
        link = {
          type: "encounter",
          id: n.encounterId,
          missing: gone,
          label: gone ? MISSING : n.encounter!.title,
          href: `/encounters/${n.encounterId}`,
        };
      } else if (n.combatId) {
        link = {
          type: "combat",
          id: n.combatId,
          missing: !n.combat,
          label: n.combat ? combatLabel(n.combat) : MISSING,
          href: `/combats/${n.combatId}`,
        };
      } else if (n.sessionId) {
        link = {
          type: "session",
          id: n.sessionId,
          missing: !n.session,
          label: n.session
            ? `Session ${n.session.number}${n.session.title ? `: ${n.session.title}` : ""}`
            : MISSING,
          href: "/story",
        };
      } else {
        const gone = !n.record || n.record.deletedAt !== null;
        link = {
          type: "record",
          id: n.recordId ?? "",
          recordKind: n.record?.kind ?? null,
          missing: gone,
          label: gone ? MISSING : n.record!.name,
          href: `/campaigns/${board.campaignId}/records`,
        };
      }
    }
    return {
      id: n.id,
      kind: n.kind,
      width: n.width,
      height: n.height,
      zIndex: n.zIndex,
      locked: n.locked,
      hidden: n.hidden,
      parentId: n.parentId,
      style: parseStyle(n.style),
      x: n.x,
      y: n.y,
      status: n.status,
      title: n.title,
      text: n.text,
      dmNote: n.dmNote,
      detail: cardDetail(n),
      arcId: n.arcId,
      link,
    };
  });

  return {
    id: board.id,
    campaignId: board.campaignId,
    name: board.name,
    version: board.version,
    viewport: parseViewport(board.viewport),
    nodes,
    edges: board.edges.map((e) => ({
      id: e.id,
      style: parseStyle(e.style),
      sourceId: e.sourceId,
      targetId: e.targetId,
      type: e.type,
      label: e.label,
    })),
    arcs: board.arcs.map((a) => ({ id: a.id, name: a.name, color: a.color })),
  };
}

export type BoardCommandName = keyof typeof boardCommands;

type Tx = Prisma.TransactionClient;

async function requireNode(tx: Tx, boardId: string, nodeId: string) {
  const node = await tx.boardNode.findFirst({
    where: { id: nodeId, boardId },
    select: { id: true },
  });
  if (!node) throw new BoardRuleError("Card not found on this board");
}

async function requireArc(tx: Tx, boardId: string, arcId: string) {
  const arc = await tx.storyArc.findFirst({
    where: { id: arcId, boardId },
    select: { id: true },
  });
  if (!arc) throw new BoardRuleError("Story arc not found on this board");
}

async function requireFrame(tx: Tx, boardId: string, frameId: string) {
  const frame = await tx.boardNode.findFirst({
    where: { id: frameId, boardId, kind: "frame" },
    select: { id: true },
  });
  if (!frame) throw new BoardRuleError("Frame not found on this board");
}

async function mergedStyle(
  tx: Tx,
  table: "boardNode" | "boardEdge",
  id: string,
  patch: BoardStyle,
): Promise<Prisma.InputJsonValue> {
  const row =
    table === "boardNode"
      ? await tx.boardNode.findUnique({
          where: { id },
          select: { style: true },
        })
      : await tx.boardEdge.findUnique({
          where: { id },
          select: { style: true },
        });
  return { ...(parseStyle(row?.style ?? null) ?? {}), ...patch };
}

/** Resolves a link to the FK column, checking it belongs to the campaign. */
async function resolveLink(
  tx: Tx,
  campaignId: string,
  link: { type: string; id: string },
): Promise<Record<string, string>> {
  const wrong = () => new BoardRuleError("That record is not in this campaign");
  if (link.type === "npc") {
    const r = await tx.npc.findFirst({
      where: { id: link.id, campaignId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw wrong();
    return { npcId: r.id };
  }
  if (link.type === "player_character") {
    const r = await tx.playerCharacter.findFirst({
      where: { id: link.id, campaignId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw wrong();
    return { playerCharacterId: r.id };
  }
  if (link.type === "encounter") {
    const r = await tx.encounter.findFirst({
      where: { id: link.id, campaignId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw wrong();
    return { encounterId: r.id };
  }
  if (link.type === "combat") {
    const r = await tx.combat.findFirst({
      where: { id: link.id, campaignId },
      select: { id: true },
    });
    if (!r) throw wrong();
    return { combatId: r.id };
  }
  if (link.type === "session") {
    const r = await tx.session.findFirst({
      where: { id: link.id, campaignId },
      select: { id: true },
    });
    if (!r) throw wrong();
    return { sessionId: r.id };
  }
  const r = await tx.storyRecord.findFirst({
    where: { id: link.id, campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!r) throw wrong();
  return { recordId: r.id };
}

const NODE_PATCH_KEYS = [
  "status",
  "dmNote",
  "arcId",
  "title",
  "text",
  "width",
  "height",
  "zIndex",
  "locked",
  "hidden",
] as const;

async function patchNode(
  tx: Tx,
  boardId: string,
  p: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  await requireNode(tx, boardId, p.nodeId);
  if (p.arcId) await requireArc(tx, boardId, p.arcId);
  const data: Prisma.BoardNodeUncheckedUpdateInput = {};
  for (const key of NODE_PATCH_KEYS) {
    if (p[key] !== undefined) (data as Record<string, unknown>)[key] = p[key];
  }
  if (p.replaceStyle !== undefined) data.style = p.replaceStyle;
  else if (p.style !== undefined)
    data.style = await mergedStyle(tx, "boardNode", p.nodeId, p.style);
  await tx.boardNode.update({ where: { id: p.nodeId }, data });
}

/**
 * Applies one validated change to a board. The board version is bumped
 * atomically first, so a save based on stale state is rejected instead of
 * overwriting newer edits. Returns the new version.
 */
export async function applyBoardCommand<N extends BoardCommandName>(
  name: N,
  input: unknown,
  db: BoardDb = getDb(),
): Promise<{ version: number; id?: string }> {
  // Each branch below reads only fields its schema guarantees.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmd = boardCommands[name].parse(input) as Record<string, any>;
  const boardId: string = cmd.boardId;

  return db.$transaction(async (tx) => {
    const bumped = await tx.board.updateMany({
      where: { id: boardId, deletedAt: null, version: cmd.expectedVersion },
      data: { version: { increment: 1 } },
    });
    if (bumped.count === 0) {
      const exists = await tx.board.findFirst({
        where: { id: boardId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new BoardNotFoundError(boardId);
      throw new BoardConflictError(boardId, cmd.expectedVersion);
    }
    const version = cmd.expectedVersion + 1;
    const board = await tx.board.findUniqueOrThrow({
      where: { id: boardId },
      select: { campaignId: true },
    });
    let createdId: string | undefined;

    switch (name as BoardCommandName) {
      case "addNode": {
        if (
          (await tx.boardNode.count({ where: { boardId } })) >= MAX_BOARD_NODES
        )
          throw new BoardRuleError(
            `A board can hold at most ${MAX_BOARD_NODES} cards`,
          );
        let fks: Record<string, string> = {};
        if (cmd.link) fks = await resolveLink(tx, board.campaignId, cmd.link);
        else if (!cmd.kind && !cmd.title && !cmd.text)
          throw new BoardRuleError("A note needs a title or text");
        const node = await tx.boardNode.create({
          data: {
            boardId,
            kind: cmd.link ? "record" : (cmd.kind ?? "note"),
            x: cmd.x,
            y: cmd.y,
            width: cmd.width,
            height: cmd.height,
            style: cmd.style,
            zIndex: cmd.kind === "frame" ? -10 : 0,
            title: cmd.title,
            text: cmd.text,
            ...fks,
          },
          select: { id: true },
        });
        createdId = node.id;
        break;
      }
      case "updateNode": {
        await patchNode(tx, boardId, cmd);
        break;
      }
      case "updateNodes": {
        for (const p of cmd.patches) await patchNode(tx, boardId, p);
        break;
      }
      case "addItems": {
        const specs = cmd.nodes as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        const existing = await tx.boardNode.count({ where: { boardId } });
        if (existing + specs.length > MAX_BOARD_NODES)
          throw new BoardRuleError(
            `A board can hold at most ${MAX_BOARD_NODES} cards`,
          );
        const edgeCount = await tx.boardEdge.count({ where: { boardId } });
        if (edgeCount + cmd.edges.length > MAX_BOARD_EDGES)
          throw new BoardRuleError(
            `A board can hold at most ${MAX_BOARD_EDGES} arrows`,
          );
        const arcIds = new Set(
          (
            await tx.storyArc.findMany({
              where: { boardId },
              select: { id: true },
            })
          ).map((a) => a.id),
        );
        // Frames first so children can point at them within the same batch.
        const ordered = [
          ...specs.filter((n) => n.kind === "frame"),
          ...specs.filter((n) => n.kind !== "frame"),
        ];
        const frameIds = new Set<string>();
        for (const n of ordered) {
          let fks: Record<string, string> = {};
          if (n.link) fks = await resolveLink(tx, board.campaignId, n.link);
          else if (!n.kind && !n.title && !n.text)
            throw new BoardRuleError("A note needs a title or text");
          const isFrame = n.kind === "frame";
          let parentId: string | null = null;
          if (n.parentId && !isFrame) {
            if (!frameIds.has(n.parentId))
              await requireFrame(tx, boardId, n.parentId).then(
                () => (parentId = n.parentId),
                () => undefined,
              );
            else parentId = n.parentId;
          }
          await tx.boardNode.create({
            data: {
              id: n.id,
              boardId,
              kind: n.link ? "record" : (n.kind ?? "note"),
              x: n.x,
              y: n.y,
              width: n.width,
              height: n.height,
              style: n.style,
              zIndex: n.zIndex ?? (isFrame ? -10 : 0),
              locked: n.locked ?? false,
              hidden: n.hidden ?? false,
              status: n.status ?? "confirmed",
              title: n.title,
              text: n.text,
              dmNote: n.dmNote,
              arcId: n.arcId && arcIds.has(n.arcId) ? n.arcId : null,
              parentId,
              ...fks,
            },
          });
          if (isFrame) frameIds.add(n.id);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const e of cmd.edges as Record<string, any>[]) {
          if (e.sourceId === e.targetId)
            throw new BoardRuleError("A card cannot link to itself");
          await requireNode(tx, boardId, e.sourceId);
          await requireNode(tx, boardId, e.targetId);
          await tx.boardEdge.create({
            data: {
              id: e.id,
              boardId,
              sourceId: e.sourceId,
              targetId: e.targetId,
              type: e.type,
              label: e.label,
              style: e.style,
            },
          });
        }
        break;
      }
      case "removeItems": {
        await tx.boardEdge.deleteMany({
          where: {
            boardId,
            OR: [
              { id: { in: cmd.edgeIds } },
              { sourceId: { in: cmd.nodeIds } },
              { targetId: { in: cmd.nodeIds } },
            ],
          },
        });
        await tx.boardNode.deleteMany({
          where: { boardId, id: { in: cmd.nodeIds } },
        });
        break;
      }
      case "moveNodes": {
        for (const p of cmd.positions as {
          id: string;
          x: number;
          y: number;
          width?: number;
          height?: number;
          parentId?: string | null;
        }[]) {
          const data: Prisma.BoardNodeUncheckedUpdateManyInput = {
            x: p.x,
            y: p.y,
          };
          if (p.width !== undefined) data.width = p.width;
          if (p.height !== undefined) data.height = p.height;
          if (p.parentId !== undefined) {
            if (p.parentId) {
              if (p.parentId === p.id)
                throw new BoardRuleError("A frame cannot contain itself");
              await requireFrame(tx, boardId, p.parentId);
              const self = await tx.boardNode.findFirst({
                where: { id: p.id, boardId },
                select: { kind: true },
              });
              if (self?.kind === "frame")
                throw new BoardRuleError("Frames cannot be nested");
            }
            data.parentId = p.parentId;
          }
          await tx.boardNode.updateMany({
            where: { id: p.id, boardId },
            data,
          });
        }
        if (cmd.viewport)
          await tx.board.update({
            where: { id: boardId },
            data: { viewport: cmd.viewport },
          });
        break;
      }
      case "removeNode": {
        await requireNode(tx, boardId, cmd.nodeId);
        await tx.boardEdge.deleteMany({
          where: {
            boardId,
            OR: [{ sourceId: cmd.nodeId }, { targetId: cmd.nodeId }],
          },
        });
        await tx.boardNode.delete({ where: { id: cmd.nodeId } });
        break;
      }
      case "addEdge": {
        if (cmd.sourceId === cmd.targetId)
          throw new BoardRuleError("A card cannot link to itself");
        await requireNode(tx, boardId, cmd.sourceId);
        await requireNode(tx, boardId, cmd.targetId);
        if (
          (await tx.boardEdge.count({ where: { boardId } })) >= MAX_BOARD_EDGES
        )
          throw new BoardRuleError(
            `A board can hold at most ${MAX_BOARD_EDGES} arrows`,
          );
        const edge = await tx.boardEdge.create({
          data: {
            boardId,
            sourceId: cmd.sourceId,
            targetId: cmd.targetId,
            type: cmd.type,
            label: cmd.label,
          },
          select: { id: true },
        });
        createdId = edge.id;
        break;
      }
      case "updateEdge": {
        const data: Prisma.BoardEdgeUncheckedUpdateInput = {};
        if (cmd.type !== undefined) data.type = cmd.type;
        if (cmd.label !== undefined) data.label = cmd.label;
        if (cmd.style !== undefined)
          data.style = await mergedStyle(
            tx,
            "boardEdge",
            cmd.edgeId,
            cmd.style,
          );
        const r = await tx.boardEdge.updateMany({
          where: { id: cmd.edgeId, boardId },
          data,
        });
        if (r.count === 0) throw new BoardRuleError("Arrow not found");
        break;
      }
      case "removeEdge": {
        const r = await tx.boardEdge.deleteMany({
          where: { id: cmd.edgeId, boardId },
        });
        if (r.count === 0) throw new BoardRuleError("Arrow not found");
        break;
      }
      case "addArc": {
        if ((await tx.storyArc.count({ where: { boardId } })) >= MAX_BOARD_ARCS)
          throw new BoardRuleError(
            `A board can hold at most ${MAX_BOARD_ARCS} story arcs`,
          );
        const arc = await tx.storyArc.create({
          data: { boardId, name: cmd.name, color: cmd.color },
          select: { id: true },
        });
        createdId = arc.id;
        break;
      }
      case "updateArc": {
        await requireArc(tx, boardId, cmd.arcId);
        await tx.storyArc.update({
          where: { id: cmd.arcId },
          data: { name: cmd.name, color: cmd.color },
        });
        break;
      }
      case "removeArc": {
        await requireArc(tx, boardId, cmd.arcId);
        await tx.storyArc.delete({ where: { id: cmd.arcId } });
        break;
      }
    }
    return { version, id: createdId };
  });
}
