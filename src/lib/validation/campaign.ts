import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const campaignInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`),
  description: z
    .string()
    .trim()
    .max(
      DESCRIPTION_MAX_LENGTH,
      `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    )
    .optional()
    .transform((v) => (v ? v : null)),
});

export const campaignIdSchema = z.string().trim().min(1, "Id is required");

export type CampaignInput = z.output<typeof campaignInputSchema>;
