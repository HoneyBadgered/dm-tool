"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "@/lib/validation/campaign";
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
  const [nameLen, setNameLen] = useState(initial?.name.length ?? 0);
  const [descLen, setDescLen] = useState(initial?.description?.length ?? 0);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium">
          Name{" "}
          <span className="text-red-700" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </span>
        <input
          name="name"
          required
          aria-required="true"
          aria-describedby="name-hint"
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => setNameLen(e.target.value.length)}
          defaultValue={initial?.name}
          className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2"
        />
        <span id="name-hint" className="text-xs text-muted">
          Required. {nameLen}/{NAME_MAX_LENGTH}
        </span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Description (optional)</span>
        <textarea
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
          aria-describedby="description-hint"
          onChange={(e) => setDescLen(e.target.value.length)}
          defaultValue={initial?.description ?? ""}
          className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2"
        />
        <span id="description-hint" className="text-xs text-muted">
          {descLen}/{DESCRIPTION_MAX_LENGTH}
        </span>
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
          {pending ? "Saving..." : submitLabel}
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
