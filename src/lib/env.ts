import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverEnvSchema.parse(source);
}

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  NODE_ENV: z.string().optional(),
});

export type AuthEnv = {
  secret: string;
  baseUrl: string | undefined;
  production: boolean;
};

// A fixed secret is only acceptable outside production, where sessions are throwaway.
const DEVELOPMENT_SECRET = "dev-only-secret-do-not-use-in-production-0000";

export function parseAuthEnv(
  source: Record<string, string | undefined> = process.env,
): AuthEnv {
  const env = authEnvSchema.parse(source);
  const production = env.NODE_ENV === "production";
  if (production && !env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET (at least 32 characters) is required in production",
    );
  }
  return {
    secret: env.BETTER_AUTH_SECRET ?? DEVELOPMENT_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    production,
  };
}
