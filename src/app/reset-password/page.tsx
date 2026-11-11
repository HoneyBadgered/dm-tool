import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Reset searchParams={searchParams} />
    </Suspense>
  );
}

async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AuthForm mode="reset" token={token} />;
}
