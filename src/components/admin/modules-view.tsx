"use client";

import { Headset, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { setModuleAccess } from "@/app/(app)/admin/modules/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { AppRole } from "@/types/database";

type Level = "agent" | "manager";
type Person = { id: string; name: string; role: AppRole };
type Access = { userId: string; module: "aftersales"; level: Level };

const LEVELS: { value: "" | Level; label: string }[] = [
  { value: "", label: "No access" },
  { value: "agent", label: "Agent — handles tickets" },
  { value: "manager", label: "Manager — also settings & deleting" },
];

export function ModulesView({ people, access }: { people: Person[]; access: Access[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const level = useMemo(() => new Map(access.filter((a) => a.module === "aftersales").map((a) => [a.userId, a.level])), [access]);
  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const count = people.filter((p) => p.role === "admin" || level.has(p.id)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Headset className="size-5 text-primary" aria-hidden /> Aftersales
        </CardTitle>
        <CardDescription>
          Support tickets from customers, their sites and warranty. {count} {count === 1 ? "person has" : "people have"} access. People without access don&apos;t see it at all.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="pl-9" />
        </div>
        <ul className="grid divide-y rounded-xl border">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">{ROLE_LABEL[p.role]}</span>
              </span>
              {p.role === "admin" ? (
                <span className="text-sm text-muted-foreground">Always (administrator)</span>
              ) : (
                <span className="flex w-full items-center gap-2 sm:w-64">
                  {saving === p.id && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
                  <NativeSelect
                    aria-label={`Aftersales access for ${p.name}`}
                    value={level.get(p.id) ?? ""}
                    disabled={saving === p.id}
                    onChange={async (e) => {
                      setSaving(p.id);
                      const res = await setModuleAccess({ userId: p.id, module: "aftersales", level: (e.target.value || null) as Level | null });
                      setSaving(null);
                      if (!res.ok) return void toast.error(res.error);
                      toast.success(e.target.value ? `${p.name} can use Aftersales` : `${p.name} no longer has Aftersales`);
                      router.refresh();
                    }}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </NativeSelect>
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
