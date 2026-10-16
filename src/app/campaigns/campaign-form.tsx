"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: { name: string; description: string | null };
  submitLabel: string;
  cancelHref: string;
};

export function CampaignForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name}
          className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Description (optional)</span>
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={initial?.description ?? ""}
          className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark disabled:opacity-60"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded border border-border px-4 py-2 text-sm"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
