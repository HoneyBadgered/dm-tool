import { z } from "zod";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export const sessionInputSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign is required"),
  number: z.coerce.number().int().min(1, "Session number must be positive"),
  title: z
    .string()
    .trim()
    .max(120, "Title must be at most 120 characters")
    .nullish()
    .transform((value) => value || null),
  playedAt: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || isValidDate(value),
      "Played date must be a valid calendar date",
    )
    .transform((value) => (value ? new Date(`${value}T12:00:00Z`) : null)),
  notes: z
    .string()
    .trim()
    .max(10000, "Session notes must be at most 10000 characters")
    .default(""),
});

export const sessionIdSchema = z.string().trim().min(1, "Id is required");

export type SessionInput = z.output<typeof sessionInputSchema>;
