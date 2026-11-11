import {
  BattleMapImageError,
  BattleMapNotFoundError,
  getBattleMapBackground,
  setBattleMapBackground,
} from "@/server/services/maps/battle-maps";
import { MAP_LIMITS } from "@/lib/validation/battle-map";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const bg = await getBattleMapBackground(id).catch(() => null);
  if (!bg) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bg.data), {
    headers: {
      "Content-Type": bg.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // The page requests this with ?v=<rev>, so a new upload gets a new URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return json({ error: "Cross-site uploads are not allowed." }, 403);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAP_LIMITS.maxImageBytes + 64 * 1024)
    return json({ error: "The image is larger than 5 MB." }, 413);
  const { id } = await params;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return json({ error: "Choose an image to upload." }, 400);
    if (file.size > MAP_LIMITS.maxImageBytes)
      return json({ error: "The image is larger than 5 MB." }, 413);
    const result = await setBattleMapBackground(id, {
      data: new Uint8Array(await file.arrayBuffer()),
      width: Number(form.get("width")),
      height: Number(form.get("height")),
    });
    return json({
      rev: result.rev,
      width: result.width,
      height: result.height,
    });
  } catch (e) {
    if (e instanceof BattleMapImageError)
      return json({ error: e.message }, 400);
    if (e instanceof BattleMapNotFoundError)
      return json({ error: "That map no longer exists." }, 404);
    if (e instanceof ZodError) return json({ error: "Invalid map." }, 400);
    console.error("map background upload failed", e);
    return json({ error: "Could not save the image. Try again." }, 500);
  }
}
