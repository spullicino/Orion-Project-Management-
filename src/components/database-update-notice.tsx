import { DatabaseZap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Shown instead of a crash when the latest database update file hasn't been run in Supabase. */
export function DatabaseUpdateNotice({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card className="border-warning">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <DatabaseZap className="size-10 text-amber-600" aria-hidden />
        <h2 className="text-lg font-semibold">The database needs an update</h2>
        <p className="max-w-md text-muted-foreground">
          {isAdmin
            ? "This part of the app needs the latest database update. In Supabase, open SQL Editor and run the newest file(s) from supabase/migrations on GitHub (see README, step 3), then reload this page."
            : "This part of the app is being updated. Please ask your administrator to finish the database update, then try again."}
        </p>
      </CardContent>
    </Card>
  );
}
