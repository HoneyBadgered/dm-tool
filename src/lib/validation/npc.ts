import { z } from "zod";

export const NPC_NAME_MAX_LENGTH = 120;
export const NPC_FIELD_MAX_LENGTH = 200;
export const NPC_NOTES_MAX_LENGTH = 5000;

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
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
  role: optionalText("Role", NPC_FIELD_MAX_LENGTH),
  location: optionalText("Location", NPC_FIELD_MAX_LENGTH),
  notes: optionalText("Notes", NPC_NOTES_MAX_LENGTH),
};

export const npcUpdateSchema = z.object(fields);

export const npcCreateSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign is required"),
  ...fields,
});

export const npcIdSchema = z.string().trim().min(1, "Id is required");

export type NpcCreateInput = z.output<typeof npcCreateSchema>;
export type NpcUpdateInput = z.output<typeof npcUpdateSchema>;
