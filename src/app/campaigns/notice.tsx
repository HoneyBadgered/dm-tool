const NOTICES = {
  created: "Campaign created.",
  updated: "Campaign updated.",
  deleted: "Campaign deleted.",
  "character-saved": "Character saved.",
  "character-deleted": "Character removed.",
  "character-invalid": "That character could not be saved. Check the fields.",
  "record-saved": "Record saved.",
  "record-deleted": "Record removed.",
  "record-invalid": "That record could not be saved. Check the fields.",
  "delete-failed": "Could not delete campaign. Please try again.",
} as const;

type NoticeKey = keyof typeof NOTICES;

export function isNoticeKey(v: string | undefined): v is NoticeKey {
  return v !== undefined && Object.hasOwn(NOTICES, v);
}

export function Notice({ notice }: { notice: string | undefined }) {
  if (!isNoticeKey(notice)) return null;
  const isError =
    notice === "delete-failed" ||
    notice === "character-invalid" ||
    notice === "record-invalid";
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
