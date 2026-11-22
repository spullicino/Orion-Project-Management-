import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/forms";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeNextPath } from "@/lib/validation/auth";
import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  // Already signed in (e.g. the app was reopened on this page)? Go straight in.
  const state = await getSessionState().catch(() => null);
  if (state?.profile?.status === "active") redirect(next);
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to Orion Projects."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {params.error && (
        <Alert variant="destructive">
          <AlertDescription>{params.error.slice(0, 200)}</AlertDescription>
        </Alert>
      )}
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} />
    </AuthCard>
  );
}
