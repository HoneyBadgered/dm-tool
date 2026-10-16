import { z } from "zod";

export const ENCOUNTER_TITLE_MAX_LENGTH = 120;
export const ENCOUNTER_NOTES_MAX_LENGTH = 5000;

export const ENCOUNTER_STATUSES = ["planned", "active", "resolved"] as const;
export type EncounterStatusValue = (typeof ENCOUNTER_STATUSES)[number];

/** Allowed status changes. Resolved is terminal; same-state is not a transition. */
export const ENCOUNTER_TRANSITIONS: Record<
  EncounterStatusValue,
  readonly EncounterStatusValue[]
> = {
  planned: ["active"],
  active: ["resolved", "planned"],
  resolved: [],
};

export function canTransition(
  from: EncounterStatusValue,
  to: EncounterStatusValue,
): boolean {
  return ENCOUNTER_TRANSITIONS[from].includes(to);
}

const fields = {
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(
      ENCOUNTER_TITLE_MAX_LENGTH,
      `Title must be at most ${ENCOUNTER_TITLE_MAX_LENGTH} characters`,
    ),
  notes: z
    .string()
    .trim()
    .max(
      ENCOUNTER_NOTES_MAX_LENGTH,
      `Notes must be at most ${ENCOUNTER_NOTES_MAX_LENGTH} characters`,
    )
    .nullish()
    .transform((v) => (v ? v : null)),
};

export const encounterUpdateSchema = z.object(fields);

export const encounterCreateSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign is required"),
  ...fields,
});

export const encounterIdSchema = z.string().trim().min(1, "Id is required");
export const encounterStatusSchema = z.enum(ENCOUNTER_STATUSES);

export type EncounterCreateInput = z.output<typeof encounterCreateSchema>;
export type EncounterUpdateInput = z.output<typeof encounterUpdateSchema>;
