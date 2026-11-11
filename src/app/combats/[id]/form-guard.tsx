"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const RESET_AFTER_MS = 10_000;

/**
 * Blocks double submits: once a form is submitted its buttons are disabled
 * until the server responds (the URL changes) or a timeout passes. The server
 * still rejects repeats through the combat version, so this is a convenience.
 */
export function FormGuard() {
  const [saving, setSaving] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const timers = new Set<number>();
    const release = () => {
      for (const form of document.querySelectorAll<HTMLFormElement>(
        "form[data-submitting]",
      )) {
        delete form.dataset.submitting;
        for (const b of form.querySelectorAll<HTMLButtonElement>(
          "button[data-guarded]",
        )) {
          b.disabled = false;
          delete b.dataset.guarded;
        }
      }
      setSaving(false);
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (form.method.toLowerCase() === "get") return;
      if (form.dataset.submitting) {
        event.preventDefault();
        return;
      }
      form.dataset.submitting = "1";
      setSaving(true);
      // Disable after the submit has read its form data and submitter.
      timers.add(
        window.setTimeout(() => {
          for (const b of form.querySelectorAll<HTMLButtonElement>("button")) {
            if (!b.disabled) {
              b.disabled = true;
              b.dataset.guarded = "1";
            }
          }
        }, 0),
      );
      timers.add(window.setTimeout(release, RESET_AFTER_MS));
    };
    document.addEventListener("submit", onSubmit, true);
    release();
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [pathname, search]);

  return (
    <p
      role="status"
      aria-live="polite"
      className={
        saving
          ? "fixed bottom-3 right-3 z-10 rounded border border-border bg-input px-3 py-1 text-sm shadow"
          : "sr-only"
      }
    >
      {saving ? "Saving…" : ""}
    </p>
  );
}
