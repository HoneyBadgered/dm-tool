"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; submit: string }> = {
  login: { title: "Sign in", submit: "Sign in" },
  signup: { title: "Create account", submit: "Create account" },
  forgot: { title: "Reset your password", submit: "Send reset link" },
  reset: { title: "Choose a new password", submit: "Set new password" },
};

const inputClass =
  "mt-1 block w-full rounded border border-border bg-surface px-3 py-2";

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (mode === "login") {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
        });
        if (err) return setError(err.message ?? "Could not sign in.");
        router.push("/");
        router.refresh();
      } else if (mode === "signup") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: String(form.get("name") ?? "").trim(),
          callbackURL: "/",
        });
        if (err) return setError(err.message ?? "Could not create account.");
        setNotice(
          "Check your email for a verification link. In development it is printed in the server log.",
        );
      } else if (mode === "forgot") {
        await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        setNotice(
          "If that email has an account, a reset link is on its way. In development it is printed in the server log.",
        );
      } else {
        if (!token) return setError("This reset link is missing its token.");
        const { error: err } = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (err) return setError(err.message ?? "Could not reset password.");
        router.push("/login");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">{COPY[mode].title}</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        {mode === "signup" ? (
          <label className="block text-sm">
            Display name
            <input
              name="name"
              required
              maxLength={80}
              autoComplete="name"
              className={inputClass}
            />
          </label>
        ) : null}
        {mode !== "reset" ? (
          <label className="block text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
            />
          </label>
        ) : null}
        {mode !== "forgot" ? (
          <label className="block text-sm">
            {mode === "reset" ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              required
              minLength={mode === "login" ? undefined : 10}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              className={inputClass}
            />
            {mode !== "login" ? (
              <span className="text-xs text-muted">
                At least 10 characters.
              </span>
            ) : null}
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
        ) : null}
        <button
          disabled={pending}
          className="rounded-md border border-border bg-primary px-3 py-2 text-sm text-on-primary disabled:opacity-60"
        >
          {pending ? "Working…" : COPY[mode].submit}
        </button>
      </form>
      <p className="mt-4 space-x-3 text-sm">
        {mode === "login" ? (
          <>
            <Link href="/signup" className="text-link underline">
              Create an account
            </Link>
            <Link href="/forgot-password" className="text-link underline">
              Forgot password?
            </Link>
          </>
        ) : (
          <Link href="/login" className="text-link underline">
            Back to sign in
          </Link>
        )}
      </p>
    </div>
  );
}
