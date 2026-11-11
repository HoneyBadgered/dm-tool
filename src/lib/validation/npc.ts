import { z } from "zod";

export const NPC_NAME_MAX_LENGTH = 120;
export const NPC_FIELD_MAX_LENGTH = 200;
export const NPC_SUMMARY_MAX_LENGTH = 500;
export const NPC_NOTES_MAX_LENGTH = 5000;
export const NPC_LONG_TEXT_MAX_LENGTH = 50_000;

export const NPC_STATUSES = [
  "active",
  "missing",
  "dead",
  "imprisoned",
  "unknown",
] as const;
export const NPC_PARTY_RELATIONSHIPS = [
  "friendly",
  "suspicious",
  "hostile",
  "unknown",
] as const;

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalId = (label: string) =>
  z
    .string()
    .trim()
    .max(64, `${label} is invalid`)
    .nullish()
    .transform((v) => (v ? v : null));

const fields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(
      NPC_NAME_MAX_LENGTH,
      `Name must be at most ${NPC_NAME_MAX_LENGTH} characters`,
    ),
  titleAlias: optionalText("Title / alias", NPC_FIELD_MAX_LENGTH),
  role: optionalText("Role", NPC_FIELD_MAX_LENGTH),
  status: z.enum(NPC_STATUSES).default("active"),
  race: optionalText("Race / species", NPC_FIELD_MAX_LENGTH),
  characterClass: optionalText("Class", NPC_FIELD_MAX_LENGTH),
  level: z
    .number({ error: "Level must be a number" })
    .int("Level must be a whole number")
    .min(1, "Level must be at least 1")
    .max(20, "Level must be at most 20")
    .nullish()
    .transform((v) => v ?? null),
  challengeRating: optionalText("Challenge rating", 20),
  location: optionalText("Location", NPC_FIELD_MAX_LENGTH),
  locationRecordId: optionalId("Location"),
  faction: optionalText("Faction", NPC_FIELD_MAX_LENGTH),
  factionRecordId: optionalId("Faction"),
  quickSummary: optionalText("Quick summary", NPC_SUMMARY_MAX_LENGTH),
  appearance: optionalText("Appearance", NPC_LONG_TEXT_MAX_LENGTH),
  personality: optionalText("Personality", NPC_LONG_TEXT_MAX_LENGTH),
  motivation: optionalText("Motivation", NPC_LONG_TEXT_MAX_LENGTH),
  goals: optionalText("Goals", NPC_LONG_TEXT_MAX_LENGTH),
  currentPlans: optionalText("Current plans", NPC_LONG_TEXT_MAX_LENGTH),
  fearWeakness: optionalText("Fear / weakness", NPC_LONG_TEXT_MAX_LENGTH),
  secret: optionalText("Secret", NPC_LONG_TEXT_MAX_LENGTH),
  knowledgeClues: optionalText("Knowledge / clues", NPC_LONG_TEXT_MAX_LENGTH),
  voiceMannerisms: optionalText("Voice / mannerisms", NPC_LONG_TEXT_MAX_LENGTH),
  partyRelationship: z
    .enum(NPC_PARTY_RELATIONSHIPS)
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText("Notes", NPC_NOTES_MAX_LENGTH),
  initiativeCombatNotes: optionalText(
    "Initiative / combat notes",
    NPC_NOTES_MAX_LENGTH,
  ),
  backstory: optionalText("Backstory", NPC_LONG_TEXT_MAX_LENGTH),
  dmNotes: optionalText("DM notes", NPC_LONG_TEXT_MAX_LENGTH),
  relationshipNotes: optionalText("Relationships", NPC_LONG_TEXT_MAX_LENGTH),
  statBlockReference: optionalText("Stat block reference", 500),
  firstAppearance: optionalText("First appearance", NPC_FIELD_MAX_LENGTH),
  lastSeen: optionalText("Last seen", NPC_FIELD_MAX_LENGTH),
  portraitUrl: z
    .union([z.url({ protocol: /^https?$/ }), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
};

export const npcUpdateSchema = z.object(fields);
export const npcNotesUpdateSchema = z.object({
  notes: optionalText("Notes", NPC_NOTES_MAX_LENGTH),
});

export const npcCreateSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign is required"),
  ...fields,
});

export const npcIdSchema = z.string().trim().min(1, "Id is required");

export type NpcCreateInput = z.output<typeof npcCreateSchema>;
export type NpcUpdateInput = z.output<typeof npcUpdateSchema>;
