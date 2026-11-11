"use client";

import { useFormStatus } from "react-dom";

export function ConfirmButton({
  message,
  children,
}: {
  message: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="text-danger underline disabled:opacity-60"
    >
      {children}
    </button>
  );
}
