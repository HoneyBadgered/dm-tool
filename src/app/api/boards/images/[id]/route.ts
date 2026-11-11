import { ZodError } from "zod";
import { getBoardImage } from "@/server/services/story/board-images";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const image = await getBoardImage(id);
    if (!image) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return new Response("Not found", { status: 404 });
    console.error("board image retrieval failed", error);
    return new Response("Could not retrieve image", { status: 500 });
  }
}
