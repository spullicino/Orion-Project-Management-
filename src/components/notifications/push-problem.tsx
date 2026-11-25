import { AlertTriangle } from "lucide-react";
import type { PushProblem } from "./use-push-device";

/** Why turning on notifications failed, what to do, and a small technical line to screenshot. */
export function PushProblemNote({ problem }: { problem: PushProblem | null }) {
  if (!problem) return null;
  return (
    <div role="alert" className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="flex gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <span>{problem.message}</span>
      </p>
      <p className="break-all pl-6 text-xs text-muted-foreground">Details for your administrator: {problem.detail}</p>
    </div>
  );
}
