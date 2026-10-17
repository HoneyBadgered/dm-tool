const NOTICES = {
  created: "Encounter created.",
  updated: "Encounter updated.",
  deleted: "Encounter deleted.",
  activated: "Encounter set active.",
  resolved: "Encounter resolved.",
  duplicated: "Encounter duplicated. You are editing the copy.",
  "entry-added": "Combatant added.",
  "entry-updated": "Combatant updated.",
  "entry-removed": "Combatant removed.",
  "entry-duplicated": "Combatant duplicated.",
  "entry-moved": "Order updated.",
  "launch-open":
    "This encounter already has an unfinished combat. Resume or end it first.",
  "launch-empty":
    "Add at least one starting combatant (wave 0) before launching.",
  "launch-missing":
    "A creature in this encounter no longer exists. Remove or replace it, then launch again.",
  "launch-incomplete":
    "A creature in this encounter is missing the stats needed to launch. Set an HP or AC override.",
  "launch-failed": "Could not launch combat. Please try again.",
  "delete-open-combat":
    "This encounter has an unfinished combat. End it before deleting the encounter.",
  "delete-failed": "Could not delete encounter. Please try again.",
  "invalid-transition": "That status change is not allowed.",
  "transition-failed": "Could not change status. Please try again.",
} as const;

type NoticeKey = keyof typeof NOTICES;

const ERRORS: readonly NoticeKey[] = [
  "launch-open",
  "launch-empty",
  "launch-missing",
  "launch-incomplete",
  "launch-failed",
  "delete-open-combat",
  "delete-failed",
  "invalid-transition",
  "transition-failed",
];

function isNoticeKey(v: string | undefined): v is NoticeKey {
  return v !== undefined && Object.hasOwn(NOTICES, v);
}

export function Notice({
  notice,
  error,
}: {
  notice: string | undefined;
  error?: string | undefined;
}) {
  if (error)
    return (
      <p
        role="alert"
        className="mb-4 rounded border border-red-700 bg-red-50 p-3 text-sm text-red-700"
      >
        {error.slice(0, 300)}
      </p>
    );
  if (!isNoticeKey(notice)) return null;
  const isError = ERRORS.includes(notice);
  return (
    <p
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "mb-4 rounded border border-red-700 bg-red-50 p-3 text-sm text-red-700"
          : "mb-4 rounded border border-forest bg-surface p-3 text-sm text-forest"
      }
    >
      {NOTICES[notice]}
    </p>
  );
}
