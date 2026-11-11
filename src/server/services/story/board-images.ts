import { getDb } from "@/lib/db/client";
import {
  MAX_BOARD_IMAGE_BYTES,
  MAX_BOARD_IMAGES_BYTES,
  MAX_BOARD_NODES,
  idSchema,
} from "@/lib/validation/board";
import { sniffImageMime } from "@/lib/validation/battle-map";
import {
  BoardConflictError,
  BoardNotFoundError,
  BoardRuleError,
  type BoardDb,
} from "./boards";
import { z } from "zod";

const coordinate = z.number().finite().min(-100_000).max(100_000);
const dimension = z.number().finite().min(20).max(5000);

const uploadSchema = z.object({
  expectedVersion: z.number().int().min(0),
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
  title: z.string().trim().max(120).optional(),
});

export class BoardImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardImageError";
  }
}

export class BoardImageNotFoundError extends Error {
  constructor() {
    super("Board image not found");
    this.name = "BoardImageNotFoundError";
  }
}

export async function createBoardImage(
  boardId: string,
  input: unknown,
  bytes: Uint8Array,
  db: BoardDb = getDb(),
): Promise<{
  version: number;
  id: string;
  imageId: string;
  imageUrl: string;
}> {
  const parsed = uploadSchema.parse(input);
  const validBoardId = idSchema.parse(boardId);
  const mime = sniffImageMime(bytes);
  if (!mime) throw new BoardImageError("Use a PNG, JPEG, or WebP image.");
  if (bytes.byteLength === 0)
    throw new BoardImageError("The image file is empty.");
  if (bytes.byteLength > MAX_BOARD_IMAGE_BYTES)
    throw new BoardImageError("Images must be 5 MB or smaller.");

  return db.$transaction(async (tx) => {
    const bumped = await tx.board.updateMany({
      where: {
        id: validBoardId,
        deletedAt: null,
        version: parsed.expectedVersion,
      },
      data: { version: { increment: 1 } },
    });
    if (bumped.count === 0) {
      const exists = await tx.board.findFirst({
        where: { id: validBoardId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new BoardNotFoundError(validBoardId);
      throw new BoardConflictError(validBoardId, parsed.expectedVersion);
    }

    const board = await tx.board.findUniqueOrThrow({
      where: { id: validBoardId },
      select: { campaignId: true },
    });
    if (
      (await tx.boardNode.count({ where: { boardId: validBoardId } })) >=
      MAX_BOARD_NODES
    )
      throw new BoardRuleError(
        `A board can hold at most ${MAX_BOARD_NODES} cards`,
      );

    const attached = await tx.boardNode.findMany({
      where: { boardId: validBoardId, imageId: { not: null } },
      select: { imageId: true },
    });
    const imageIds = [...new Set(attached.flatMap((n) => n.imageId ?? []))];
    const existing = imageIds.length
      ? await tx.boardImage.findMany({
          where: { id: { in: imageIds } },
          select: { id: true, sizeBytes: true },
        })
      : [];
    const usedBytes = existing.reduce((sum, image) => sum + image.sizeBytes, 0);
    if (usedBytes + bytes.byteLength > MAX_BOARD_IMAGES_BYTES)
      throw new BoardRuleError("This board has reached its 50 MB image limit.");

    const image = await tx.boardImage.create({
      data: {
        campaignId: board.campaignId,
        mime,
        sizeBytes: bytes.byteLength,
        data: Buffer.from(bytes),
      },
      select: { id: true },
    });
    const node = await tx.boardNode.create({
      data: {
        boardId: validBoardId,
        kind: "image",
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
        title: parsed.title || null,
        imageId: image.id,
      },
      select: { id: true },
    });
    return {
      version: parsed.expectedVersion + 1,
      id: node.id,
      imageId: image.id,
      imageUrl: `/api/boards/images/${image.id}`,
    };
  });
}

export async function getBoardImage(
  imageId: string,
  db: BoardDb = getDb(),
): Promise<{ mime: string; data: Uint8Array } | null> {
  const image = await db.boardImage.findUnique({
    where: { id: idSchema.parse(imageId) },
    select: { mime: true, data: true },
  });
  return image ? { mime: image.mime, data: image.data } : null;
}
