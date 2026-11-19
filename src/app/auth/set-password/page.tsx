import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SetPasswordForm } from "@/components/auth/forms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect(`/login?error=${encodeURIComponent("Your link has expired. Please request a new one.")}`);
  }
  return (
    <AuthCard title="Choose a password" description="You'll use this with your email to sign in.">
      <SetPasswordForm />
    </AuthCard>
  );
}
