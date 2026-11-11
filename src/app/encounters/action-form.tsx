"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
};

/** A form whose server action can return an inline error. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={className}>
      {children}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 basis-full text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
