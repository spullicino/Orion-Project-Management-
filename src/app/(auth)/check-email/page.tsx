import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResendConfirmationForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard
      title="Check your email"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-12 text-primary" aria-hidden />
        <p className="text-base">
          We sent a confirmation link to {email ? <strong className="break-all">{email}</strong> : "your email address"}.
        </p>
        <p className="text-sm text-muted-foreground">
          Tap the link in that email to confirm your account. It can take a minute to arrive. Check your spam folder too.
        </p>
      </div>
      {email && <ResendConfirmationForm email={email} />}
    </AuthCard>
  );
}
