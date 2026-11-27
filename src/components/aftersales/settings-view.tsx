"use client";

import { Clock, Loader2, Mail, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveCategory } from "@/app/(app)/aftersales/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AsCategory } from "@/types/aftersales";

function CategoryRow({ c, canEdit }: { c: AsCategory; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(c.name);
  const [busy, setBusy] = useState(false);
  const save = async (n: string, active: boolean) => {
    setBusy(true);
    const res = await saveCategory(c.id, n, active);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Saved");
    router.refresh();
  };
  return (
    <li className="flex items-center gap-2 py-1">
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!canEdit || busy} aria-label="Category name" className="min-w-0 flex-1" />
      {canEdit && name.trim() !== c.name && (
        <Button size="icon" variant="outline" aria-label="Save name" disabled={busy || !name.trim()} onClick={() => save(name, c.active)}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        </Button>
      )}
      <label className="flex h-11 shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Switch checked={c.active} disabled={!canEdit || busy} onCheckedChange={(v) => save(c.name, v)} aria-label={`${c.name} in use`} />
        <span className="hidden sm:inline">{c.active ? "In use" : "Hidden"}</span>
      </label>
    </li>
  );
}

export function AftersalesSettings({ categories, isManager }: { categories: AsCategory[]; isManager: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            What the ticket is about. Hidden categories stay on old tickets but can&apos;t be chosen for new ones.{!isManager && " Only Aftersales managers can change them."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid">
            {categories.map((c) => (
              <CategoryRow key={c.id} c={c} canEdit={isManager} />
            ))}
          </ul>
          {isManager && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const res = await saveCategory(null, name);
                setBusy(false);
                if (!res.ok) return void toast.error(res.error);
                setName("");
                router.refresh();
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New category, e.g. Lifts" aria-label="New category" className="min-w-0 flex-1" />
              <Button type="submit" variant="outline" disabled={busy || !name.trim()}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden /> Email (support@oriongroup.com.mt)
          </CardTitle>
          <CardDescription>Coming next: connect the Gmail mailbox so emails open tickets automatically, replies thread on the same ticket, and your answers are sent from support@.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" aria-hidden /> Response targets
          </CardTitle>
          <CardDescription>
            Coming after email: alerts when a ticket isn&apos;t answered or fixed in time. Planned targets (working hours, Mon–Fri 08:00–17:00): Urgent — reply 1 h, fixed 1 day · High — 4 h, 3 days · Normal — 8 h, 5 days · Low — 2 days, 10 days.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
