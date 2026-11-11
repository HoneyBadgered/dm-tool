"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  NPC_FIELD_MAX_LENGTH,
  NPC_LONG_TEXT_MAX_LENGTH,
  NPC_NAME_MAX_LENGTH,
  NPC_NOTES_MAX_LENGTH,
  NPC_PARTY_RELATIONSHIPS,
  NPC_STATUSES,
  NPC_SUMMARY_MAX_LENGTH,
} from "@/lib/validation/npc";
import type { NpcRecordOption } from "@/server/services/npcs/npcs";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Present on create only; campaign cannot be changed when editing. */
  campaigns?: { id: string; name: string }[];
  records: NpcRecordOption[];
  initial?: {
    campaignId: string;
    name: string;
    titleAlias: string | null;
    role: string | null;
    status: string;
    race: string | null;
    characterClass: string | null;
    level: number | null;
    challengeRating: string | null;
    location: string | null;
    locationRecordId: string | null;
    faction: string | null;
    factionRecordId: string | null;
    quickSummary: string | null;
    appearance: string | null;
    personality: string | null;
    motivation: string | null;
    goals: string | null;
    currentPlans: string | null;
    fearWeakness: string | null;
    secret: string | null;
    knowledgeClues: string | null;
    voiceMannerisms: string | null;
    partyRelationship: string | null;
    notes: string | null;
    initiativeCombatNotes: string | null;
    backstory: string | null;
    dmNotes: string | null;
    relationshipNotes: string | null;
    statBlockReference: string | null;
    firstAppearance: string | null;
    lastSeen: string | null;
    portraitUrl: string | null;
  };
  submitLabel: string;
  cancelHref: string;
};

const input =
  "mt-1 block w-full rounded border border-border bg-surface px-3 py-2";
const section =
  "space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm";
const textarea = `${input} resize-y`;

const statusLabels: Record<(typeof NPC_STATUSES)[number], string> = {
  active: "Active",
  missing: "Missing",
  dead: "Dead",
  imprisoned: "Imprisoned",
  unknown: "Unknown",
};

const relationshipLabels: Record<
  (typeof NPC_PARTY_RELATIONSHIPS)[number],
  string
> = {
  friendly: "Friendly",
  suspicious: "Suspicious",
  hostile: "Hostile",
  unknown: "Unknown",
};

function TextField({
  label,
  name,
  initial,
  maxLength = NPC_FIELD_MAX_LENGTH,
  placeholder,
}: {
  label: string;
  name: string;
  initial?: string | null;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        required={name === "name"}
        maxLength={maxLength}
        defaultValue={initial ?? ""}
        placeholder={placeholder}
        className={input}
      />
    </label>
  );
}

function LongField({
  label,
  name,
  initial,
  maxLength = NPC_LONG_TEXT_MAX_LENGTH,
  rows = 3,
}: {
  label: string;
  name: string;
  initial?: string | null;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        name={name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={initial ?? ""}
        className={textarea}
      />
    </label>
  );
}

export function NpcForm({
  action,
  campaigns,
  records,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [campaignId, setCampaignId] = useState(initial?.campaignId ?? "");
  const [locationRecordId, setLocationRecordId] = useState(
    initial?.locationRecordId ?? "",
  );
  const [factionRecordId, setFactionRecordId] = useState(
    initial?.factionRecordId ?? "",
  );
  const availableRecords = records.filter(
    (record) => record.campaignId === campaignId,
  );

  return (
    <form action={formAction} className="space-y-5">
      {campaigns && (
        <label className="block text-sm">
          <span className="font-medium">Campaign *</span>
          <select
            name="campaignId"
            required
            value={campaignId}
            onChange={(event) => {
              setCampaignId(event.target.value);
              setLocationRecordId("");
              setFactionRecordId("");
            }}
            className={input}
          >
            <option value="" disabled>
              Select a campaign
            </option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className={section}>
        <h2 className="font-semibold">Quick reference</h2>
        <TextField
          label="Name *"
          name="name"
          initial={initial?.name}
          maxLength={NPC_NAME_MAX_LENGTH}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Title / alias"
            name="titleAlias"
            initial={initial?.titleAlias}
          />
          <TextField label="Role" name="role" initial={initial?.role} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Status</span>
            <select
              name="status"
              defaultValue={initial?.status ?? "active"}
              className={input}
            >
              {NPC_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Party relationship</span>
            <select
              name="partyRelationship"
              defaultValue={initial?.partyRelationship ?? ""}
              className={input}
            >
              <option value="">Not set</option>
              {NPC_PARTY_RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {relationshipLabels[relationship]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <LongField
          label="Quick summary"
          name="quickSummary"
          initial={initial?.quickSummary}
          maxLength={NPC_SUMMARY_MAX_LENGTH}
          rows={2}
        />
        <LongField
          label="Notes"
          name="notes"
          initial={initial?.notes}
          maxLength={NPC_NOTES_MAX_LENGTH}
          rows={4}
        />
      </section>

      <section className={section}>
        <h2 className="font-semibold">Identity and ties</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Race / species"
            name="race"
            initial={initial?.race}
          />
          <TextField
            label="Class"
            name="characterClass"
            initial={initial?.characterClass}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Level</span>
            <input
              name="level"
              type="number"
              min={1}
              max={20}
              defaultValue={initial?.level ?? ""}
              className={input}
            />
          </label>
          <TextField
            label="Challenge rating"
            name="challengeRating"
            initial={initial?.challengeRating}
            maxLength={20}
            placeholder="For example: 1/2"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Location (free text)"
            name="location"
            initial={initial?.locationRecordId ? "" : initial?.location}
          />
          <label className="block text-sm">
            <span className="font-medium">Linked location record</span>
            <select
              name="locationRecordId"
              value={locationRecordId}
              onChange={(event) => setLocationRecordId(event.target.value)}
              className={input}
            >
              <option value="">No linked location</option>
              {availableRecords
                .filter((record) => record.kind === "location")
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Faction (free text)"
            name="faction"
            initial={initial?.factionRecordId ? "" : initial?.faction}
          />
          <label className="block text-sm">
            <span className="font-medium">Linked faction record</span>
            <select
              name="factionRecordId"
              value={factionRecordId}
              onChange={(event) => setFactionRecordId(event.target.value)}
              className={input}
            >
              <option value="">No linked faction</option>
              {availableRecords
                .filter((record) => record.kind === "faction")
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">
          Linked location and faction choices belong to this campaign.
        </p>
      </section>

      <details className={section}>
        <summary className="cursor-pointer font-semibold">
          Roleplaying and story
        </summary>
        <div className="space-y-4">
          <LongField
            label="Appearance"
            name="appearance"
            initial={initial?.appearance}
          />
          <LongField
            label="Personality"
            name="personality"
            initial={initial?.personality}
          />
          <LongField
            label="Motivation"
            name="motivation"
            initial={initial?.motivation}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <LongField label="Goals" name="goals" initial={initial?.goals} />
            <LongField
              label="Current plans"
              name="currentPlans"
              initial={initial?.currentPlans}
            />
          </div>
          <LongField
            label="Fear / weakness"
            name="fearWeakness"
            initial={initial?.fearWeakness}
          />
          <LongField label="Secret" name="secret" initial={initial?.secret} />
          <LongField
            label="Knowledge / clues"
            name="knowledgeClues"
            initial={initial?.knowledgeClues}
          />
          <LongField
            label="Voice / mannerisms"
            name="voiceMannerisms"
            initial={initial?.voiceMannerisms}
          />
        </div>
      </details>

      <details className={section}>
        <summary className="cursor-pointer font-semibold">
          Session and mechanics
        </summary>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="First appearance"
              name="firstAppearance"
              initial={initial?.firstAppearance}
            />
            <TextField
              label="Last seen"
              name="lastSeen"
              initial={initial?.lastSeen}
            />
          </div>
          <TextField
            label="Stat block reference"
            name="statBlockReference"
            initial={initial?.statBlockReference}
            maxLength={500}
            placeholder="Name or URL for a reusable stat block"
          />
          <LongField
            label="Initiative / combat notes"
            name="initiativeCombatNotes"
            initial={initial?.initiativeCombatNotes}
            maxLength={NPC_NOTES_MAX_LENGTH}
          />
          <TextField
            label="Portrait URL"
            name="portraitUrl"
            initial={initial?.portraitUrl}
            maxLength={2048}
            placeholder="https://…"
          />
        </div>
      </details>

      <details className={section}>
        <summary className="cursor-pointer font-semibold">
          Notes and relationships
        </summary>
        <div className="space-y-4">
          <LongField
            label="Relationships"
            name="relationshipNotes"
            initial={initial?.relationshipNotes}
            rows={5}
          />
          <LongField
            label="DM notes"
            name="dmNotes"
            initial={initial?.dmNotes}
            rows={5}
          />
        </div>
      </details>

      <details className={section}>
        <summary className="cursor-pointer font-semibold">Backstory</summary>
        <div className="mt-4">
          <LongField
            label="Backstory"
            name="backstory"
            initial={initial?.backstory}
            rows={10}
          />
        </div>
      </details>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover disabled:opacity-60"
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
