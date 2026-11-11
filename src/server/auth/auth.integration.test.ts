import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("account auth (integration)", () => {
  const email = `dm-${Date.now()}@example.test`;
  const password = "correct horse battery";

  beforeAll(() => {
    process.env.DATABASE_URL = url;
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
  });

  afterAll(async () => {
    await getDb().user.deleteMany({ where: { email } });
  });

  it("requires email verification before sign-in, then allows it", async () => {
    const { getAuth } = await import("./auth");
    const auth = getAuth();
    const mail = vi.spyOn(console, "info").mockImplementation(() => {});

    await auth.api.signUpEmail({ body: { email, password, name: "Test DM" } });

    await expect(
      auth.api.signInEmail({ body: { email, password } }),
    ).rejects.toThrow();

    const logged = mail.mock.calls.map((c) => String(c[0])).join("\n");
    mail.mockRestore();
    const link = /verify-email\?token=([^\s&]+)/.exec(logged);
    expect(link).not.toBeNull();

    await auth.api.verifyEmail({ query: { token: link![1] } });
    const session = await auth.api.signInEmail({ body: { email, password } });
    expect(session.user.email).toBe(email);
  });

  it("rejects a wrong password and short passwords", async () => {
    const { getAuth } = await import("./auth");
    const auth = getAuth();
    await expect(
      auth.api.signInEmail({ body: { email, password: "wrong-password-1" } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signUpEmail({
        body: { email: `x-${email}`, password: "short", name: "X" },
      }),
    ).rejects.toThrow();
  });

  it("stores the password hashed", async () => {
    const account = await getDb().account.findFirst({
      where: { user: { email }, providerId: "credential" },
    });
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain(password);
  });
});
