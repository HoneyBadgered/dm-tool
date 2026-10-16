const NOTICES = {
  created: "Encounter created.",
  updated: "Encounter updated.",
  deleted: "Encounter deleted.",
  activated: "Encounter set active.",
  resolved: "Encounter resolved.",
  "delete-failed": "Could not delete encounter. Please try again.",
  "invalid-transition": "That status change is not allowed.",
  "transition-failed": "Could not change status. Please try again.",
} as const;

type NoticeKey = keyof typeof NOTICES;

const ERRORS: readonly NoticeKey[] = [
  "delete-failed",
  "invalid-transition",
  "transition-failed",
];

function isNoticeKey(v: string | undefined): v is NoticeKey {
  return v !== undefined && Object.hasOwn(NOTICES, v);
}

export function Notice({ notice }: { notice: string | undefined }) {
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
