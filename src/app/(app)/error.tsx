"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Friendly fallback for any unexpected error inside the signed-in app. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <TriangleAlert className="size-10 text-destructive" aria-hidden />
        <h2 className="text-lg font-semibold">Sorry, this page couldn&apos;t load</h2>
        <p className="max-w-md text-muted-foreground">
          Please try again. If it keeps happening, tell your administrator
          {error.digest ? (
            <>
              {" "}and mention code <code className="rounded bg-muted px-1">{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <div className="flex gap-2">
          <Button onClick={reset}>
            <RotateCcw aria-hidden /> Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/home">Go to Home</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
