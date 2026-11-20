import { Check, TriangleAlert } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

const REGION_NAMES: Record<string, string> = {
  fra1: "Frankfurt",
  cdg1: "Paris",
  dub1: "Dublin",
  lhr1: "London",
  arn1: "Stockholm",
  iad1: "Washington DC (USA)",
  sfo1: "San Francisco (USA)",
  cle1: "Cleveland (USA)",
  pdx1: "Portland (USA)",
};

/** Typical time for one database question, measured from the server (best of 3). */
async function databaseMs(supabase: SupabaseClient, userId: string) {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    times.push(performance.now() - t);
  }
  return Math.round(Math.min(...times));
}

/** Admin → Speed check: where the app's server runs and how quickly it reaches the database. */
export async function SpeedCheck({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const region = process.env.VERCEL_REGION ?? null;
  const ms = await databaseMs(supabase, userId);
  const regionOk = !region || region === "fra1";
  const fast = ms < 40;
  return (
    <ul className="divide-y">
      <li className="flex items-start gap-3 py-2">
        {regionOk ? <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />}
        <span>
          <span className="block font-medium">App server: {region ? `${REGION_NAMES[region] ?? region} (${region})` : "this computer (development)"}</span>
          <span className="block text-sm text-muted-foreground">
            {regionOk
              ? "Next to the database in Frankfurt — good."
              : "Far from the database in Frankfurt. In Vercel: Settings → Functions → Function Region → Frankfurt (fra1), then redeploy."}
          </span>
        </span>
      </li>
      <li className="flex items-start gap-3 py-2">
        {fast ? <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />}
        <span>
          <span className="block font-medium">Database response: {ms} ms</span>
          <span className="block text-sm text-muted-foreground">
            {fast ? "Fast." : "Slow — usually the server region above. Under 40 ms is good; each page asks the database a few times."}
          </span>
        </span>
      </li>
    </ul>
  );
}
