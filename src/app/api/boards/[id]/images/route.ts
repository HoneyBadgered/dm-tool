import { ZodError } from "zod";
import { MAX_BOARD_IMAGE_BYTES } from "@/lib/validation/board";
import {
  BoardImageError,
  createBoardImage,
} from "@/server/services/story/board-images";
import {
  BoardConflictError,
  BoardNotFoundError,
  BoardRuleError,
} from "@/server/services/story/boards";

type Ctx = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request, { params }: Ctx) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return json({ error: "Cross-site uploads are not allowed." }, 403);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BOARD_IMAGE_BYTES + 64 * 1024)
    return json({ error: "Images must be 5 MB or smaller." }, 413);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return json({ error: "Paste an image to add it to the board." }, 400);
    if (file.size > MAX_BOARD_IMAGE_BYTES)
      return json({ error: "Images must be 5 MB or smaller." }, 413);
    const { id } = await params;
    const numberField = (name: string) => {
      const value = form.get(name);
      return value === null ? Number.NaN : Number(value);
    };
    const image = await createBoardImage(
      id,
      {
        expectedVersion: numberField("expectedVersion"),
        x: numberField("x"),
        y: numberField("y"),
        width: numberField("width"),
        height: numberField("height"),
        title: form.get("title")?.toString(),
      },
      new Uint8Array(await file.arrayBuffer()),
    );
    return json(image);
  } catch (e) {
    if (e instanceof BoardImageError) return json({ error: e.message }, 400);
    if (e instanceof BoardNotFoundError)
      return json({ error: "That board no longer exists." }, 404);
    if (e instanceof BoardConflictError)
      return json(
        {
          error: "The board changed elsewhere. Reload to continue.",
          conflict: true,
        },
        409,
      );
    if (e instanceof BoardRuleError) return json({ error: e.message }, 400);
    if (e instanceof ZodError)
      return json({ error: e.issues[0]?.message ?? "Invalid image." }, 400);
    console.error("board image upload failed", e);
    return json({ error: "Could not save the image. Try again." }, 500);
  }
}
