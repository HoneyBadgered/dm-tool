const NOTICES = {
  created: "NPC created.",
  updated: "NPC updated.",
  "notes-updated": "Notes saved.",
  "notes-save-failed": "Could not save notes. Please try again.",
  deleted: "NPC deleted.",
  "delete-failed": "Could not delete NPC. Please try again.",
} as const;

type NoticeKey = keyof typeof NOTICES;

function isNoticeKey(v: string | undefined): v is NoticeKey {
  return v !== undefined && Object.hasOwn(NOTICES, v);
}

export function Notice({ notice }: { notice: string | undefined }) {
  if (!isNoticeKey(notice)) return null;
  const isError = notice === "delete-failed" || notice === "notes-save-failed";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "mb-4 rounded border border-danger bg-danger/15 p-3 text-sm text-danger"
          : "mb-4 rounded border border-primary bg-surface p-3 text-sm text-link"
      }
    >
      {NOTICES[notice]}
    </p>
  );
}
