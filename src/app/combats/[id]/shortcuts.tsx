"use client";

import { useEffect } from "react";

/**
 * N = next turn, P = previous turn. Ignored while typing, with modifier keys,
 * on key repeat, or when the matching button is disabled. Goes through the
 * normal form, so server validation and the double-submit guard still apply.
 */
export function Shortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(
            target.tagName,
          ))
      )
        return;
      const id =
        event.key === "n"
          ? "turn-next"
          : event.key === "p"
            ? "turn-previous"
            : null;
      if (!id) return;
      const form = document.getElementById(id) as HTMLFormElement | null;
      const button = form?.querySelector("button");
      if (!form || !button || button.disabled) return;
      event.preventDefault();
      form.requestSubmit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
