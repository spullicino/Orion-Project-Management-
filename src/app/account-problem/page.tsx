import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { getSessionState } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account problem" };

export default async function AccountProblemPage() {
  const state = await getSessionState();
  if (!state.userId) redirect("/login");
  if (state.profile) redirect(state.profile.status === "active" ? "/home" : "/pending");

  return (
    <AuthCard title="We couldn't open your account">
      <div className="flex flex-col items-center gap-3 text-center">
        <TriangleAlert className="size-12 text-destructive" aria-hidden />
        <p>You are signed in{state.email ? ` as ${state.email}` : ""}, but your Orion Projects profile couldn&apos;t be loaded.</p>
        <p className="w-full rounded-lg bg-muted p-3 text-left text-sm break-words">
          <strong>Details for your administrator:</strong> {state.problem}
        </p>
      </div>
      <div className="grid gap-3">
        <Button asChild size="lg">
          <a href="/home">Try again</a>
        </Button>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
