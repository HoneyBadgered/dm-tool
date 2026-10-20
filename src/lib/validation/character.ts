import { z } from "zod";

export const ABILITY_LABELS = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
] as const;

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalInt = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`)
    .nullish()
    .transform((v) => v ?? null);

const abilityScores = z
  .array(
    z.object({
      label: z.enum(ABILITY_LABELS),
      value: z.number().int().min(1).max(30),
    }),
  )
  .max(6)
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

const fields = {
  name: z.string().trim().min(1, "Name is required").max(80),
  playerName: optionalText("Player name", 80),
  race: optionalText("Race", 80),
  characterClass: optionalText("Class", 80),
  level: optionalInt("Level", 1, 20),
  maxHp: z.number().int().min(1, "HP must be at least 1").max(999_999),
  armorClass: z.number().int().min(0).max(99),
  initiativeModifier: z.number().int().min(-20).max(20).default(0),
  speed: optionalText("Speed", 100),
  passivePerception: optionalInt("Passive Perception", 0, 99),
  abilityScores,
  notes: optionalText("Notes", 5000),
  backstory: optionalText("Backstory", 50_000),
};

export const characterUpdateSchema = z.object(fields);
export const characterCreateSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign is required"),
  ...fields,
});
export const characterIdSchema = z.string().trim().min(1, "Id is required");

export type CharacterInput = z.output<typeof characterUpdateSchema>;
