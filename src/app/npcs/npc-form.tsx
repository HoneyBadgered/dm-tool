"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  NPC_FIELD_MAX_LENGTH,
  NPC_NAME_MAX_LENGTH,
  NPC_NOTES_MAX_LENGTH,
} from "@/lib/validation/npc";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Present on create only; campaign cannot be changed when editing. */
  campaigns?: { id: string; name: string }[];
  initial?: {
    name: string;
    role: string | null;
    location: string | null;
    notes: string | null;
  };
  submitLabel: string;
  cancelHref: string;
};

const input =
  "mt-1 block w-full rounded border border-border bg-surface px-3 py-2";

export function NpcForm({
  action,
  campaigns,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-4">
      {campaigns && (
        <label className="block text-sm">
          <span className="font-medium">Campaign *</span>
          <select name="campaignId" required defaultValue="" className={input}>
            <option value="" disabled>
              Select a campaign
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium">Name *</span>
        <input
          name="name"
          required
          maxLength={NPC_NAME_MAX_LENGTH}
          defaultValue={initial?.name}
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Role (optional)</span>
        <input
          name="role"
          maxLength={NPC_FIELD_MAX_LENGTH}
          defaultValue={initial?.role ?? ""}
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Location (optional)</span>
        <input
          name="location"
          maxLength={NPC_FIELD_MAX_LENGTH}
          defaultValue={initial?.location ?? ""}
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Notes (optional)</span>
        <textarea
          name="notes"
          rows={5}
          maxLength={NPC_NOTES_MAX_LENGTH}
          defaultValue={initial?.notes ?? ""}
          className={input}
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
