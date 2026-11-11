export const SLUG_KINDS = [
  "board",
  "map",
  "npc",
  "encounter",
  "combat",
  "campaign",
] as const;
export type SlugKind = (typeof SLUG_KINDS)[number];

const RESERVED = new Set(["new", "player", "create", "edit", "records"]);
const MAX_LENGTH = 60;

export function slugify(name: string, fallback: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");
  const slug = base || fallback;
  return RESERVED.has(slug) ? `${slug}-${fallback}` : slug;
}

export function slugCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}
