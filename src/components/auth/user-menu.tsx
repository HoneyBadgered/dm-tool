import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { SignOutButton } from "./sign-out-button";

export async function UserMenu() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="flex gap-3 px-4 py-2 text-sm">
        <Link href="/login" className="text-link underline">
          Sign in
        </Link>
        <Link href="/signup" className="text-link underline">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="px-4 py-2 text-sm">
      <p className="truncate font-medium" title={user.email}>
        {user.name}
      </p>
      <SignOutButton />
    </div>
  );
}
