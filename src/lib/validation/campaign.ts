import { z } from "zod";

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z
    .string()
    .trim()
    .max(2000, "Description is too long")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const campaignIdSchema = z.string().trim().min(1, "Id is required");

export type CampaignInput = z.output<typeof campaignInputSchema>;
