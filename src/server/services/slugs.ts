import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { slugCandidate, slugify, type SlugKind } from "@/lib/slug";

const MAX_ATTEMPTS = 50;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Maps a URL segment to an entity id: a known slug resolves to its id, anything else is treated as an id. */
export async function resolveSlugParam(
  kind: SlugKind,
  param: string,
): Promise<string> {
  const row = await getDb().slug.findUnique({
    where: { kind_slug: { kind, slug: param } },
    select: { entityId: true },
  });
  return row?.entityId ?? param;
}

/** Returns the stable slug for an entity, creating one from its name on first use. */
export async function ensureSlug(
  kind: SlugKind,
  entityId: string,
  name: string,
): Promise<string> {
  const db = getDb();
  const find = () =>
    db.slug.findUnique({
      where: { kind_entityId: { kind, entityId } },
      select: { slug: true },
    });

  const existing = await find();
  if (existing) return existing.slug;

  const base = slugify(name, kind);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const slug = slugCandidate(base, attempt);
    try {
      await db.slug.create({ data: { kind, slug, entityId } });
      return slug;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await find();
      if (raced) return raced.slug;
    }
  }
  const fallback = `${base}-${entityId.slice(-8).toLowerCase()}`;
  await db.slug.create({ data: { kind, slug: fallback, entityId } });
  return fallback;
}

type Search = Record<string, string | string[] | undefined>;

function toQuery(search: Search): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Redirects to the slug URL when the request used a raw id. */
export async function redirectToSlugUrl(options: {
  kind: SlugKind;
  param: string;
  entity: { id: string; name: string };
  path: (slug: string) => string;
  search?: Search;
}): Promise<void> {
  const slug = await ensureSlug(
    options.kind,
    options.entity.id,
    options.entity.name,
  );
  if (slug !== options.param) {
    redirect(`${options.path(slug)}${toQuery(options.search ?? {})}`);
  }
}
