import { z } from "zod";

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;
