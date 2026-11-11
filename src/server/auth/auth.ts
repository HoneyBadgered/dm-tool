import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db/client";
import { parseAuthEnv } from "@/lib/env";
import { getMailer } from "@/server/mail/mailer";

function createAuth() {
  const env = parseAuthEnv();
  const mailer = getMailer();
  return betterAuth({
    secret: env.secret,
    baseURL: env.baseUrl,
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    // The story-session model already owns the name "Session".
    session: { modelName: "authSession" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: "Reset your DM Tool password",
          text: `Reset your password: ${url}\n\nIf you did not ask for this, ignore this message.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: "Verify your DM Tool email",
          text: `Confirm your email address: ${url}`,
        });
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/send-verification-email": { window: 3600, max: 5 },
      },
    },
    advanced: { useSecureCookies: env.production },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
