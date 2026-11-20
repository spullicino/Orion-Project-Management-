import { Clock, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { getSessionState } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  const { userId, profile } = await getSessionState();
  if (!userId) redirect("/login");
  if (!profile) redirect("/account-problem");
  if (profile.status === "active") redirect("/home");

  const deactivated = profile.status === "deactivated";
  return (
    <AuthCard title={deactivated ? "Account deactivated" : "Almost there!"}>
      <div className="flex flex-col items-center gap-3 text-center">
        {deactivated ? (
          <ShieldOff className="size-12 text-destructive" aria-hidden />
        ) : (
          <Clock className="size-12 text-primary" aria-hidden />
        )}
        <p className="text-base">
          {deactivated
            ? "Your account has been deactivated. If you think this is a mistake, please contact your administrator."
            : "Your account is waiting for an administrator to approve it. You'll be able to use Orion Projects as soon as they do."}
        </p>
        <p className="text-sm text-muted-foreground break-all">Signed in as {profile.email}</p>
      </div>
      <div className="grid gap-3">
        {!deactivated && (
          <Button asChild size="lg">
            <a href="/pending">Check again</a>
          </Button>
        )}
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
