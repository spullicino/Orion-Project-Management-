"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProject, updateProject } from "@/app/(app)/projects/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/lib/utils";
import type { Client, Project } from "@/types/board";
import { ColorPicker } from "./color-picker";

type Person = { id: string; first_name: string; last_name: string; email: string; avatar_src: string | null; role: string };
type Source = { id: string; name: string; is_template: boolean };

const NEW_CLIENT = "__new__";

export function ProjectForm({
  mode,
  project,
  clients,
  people = [],
  sources = [],
  meId,
}: {
  mode: "create" | "edit";
  project?: Project;
  clients: Client[];
  people?: Person[];
  sources?: Source[];
  meId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [color, setColor] = useState(project?.color ?? "#2d57a3");
  const [clientChoice, setClientChoice] = useState(project?.client_id ?? "");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    const values = {
      name: form.get("name"),
      code: form.get("code"),
      description: form.get("description"),
      client_id: clientChoice === NEW_CLIENT ? null : clientChoice,
      new_client_name: clientChoice === NEW_CLIENT ? form.get("new_client_name") : null,
      start_date: form.get("start_date"),
      end_date: form.get("end_date"),
      color,
      status: form.get("status") ?? "active",
    };
    start(async () => {
      if (mode === "create") {
        const res = await createProject({ ...values, source_id: form.get("source_id"), member_ids: members });
        if (!res.ok) return setError(res.error);
        toast.success("Project created");
        router.push(`/projects/${res.data!.id}/board`);
      } else {
        const res = await updateProject(project!.id, values);
        if (!res.ok) return setError(res.error);
        toast.success("Project saved");
      }
    });
  }

  return (
    <form action={submit} className="grid gap-5">
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}

      <FormField id="name" label="Project name">
        <Input name="name" defaultValue={project?.name} required maxLength={160} placeholder="e.g. Sliema Apartment Refurbishment" />
      </FormField>

      {mode === "create" && sources.length > 0 && (
        <FormField id="source_id" label="Start from" hint="Copies the groups, tasks, statuses and checklists. Dates move to the new start date.">
          <NativeSelect name="source_id" defaultValue="">
            <option value="">A blank project</option>
            {sources.some((s) => s.is_template) && (
              <optgroup label="Templates">
                {sources.filter((s) => s.is_template).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Copy an existing project">
              {sources.filter((s) => !s.is_template).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          </NativeSelect>
        </FormField>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="client" label="Client (optional)">
          <NativeSelect value={clientChoice} onChange={(e) => setClientChoice(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={NEW_CLIENT}>+ New client…</option>
          </NativeSelect>
        </FormField>
        <FormField id="code" label="Project code (optional)">
          <Input name="code" defaultValue={project?.code ?? ""} maxLength={40} placeholder="e.g. SLM-014" />
        </FormField>
      </div>
      {clientChoice === NEW_CLIENT && (
        <FormField id="new_client_name" label="New client's name">
          <Input name="new_client_name" required maxLength={160} />
        </FormField>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="start_date" label="Start date">
          <Input name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
        </FormField>
        <FormField id="end_date" label="End date">
          <Input name="end_date" type="date" defaultValue={project?.end_date ?? ""} />
        </FormField>
      </div>

      {mode === "edit" && (
        <FormField id="status" label="Project status">
          <NativeSelect name="status" defaultValue={project?.status}>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived (hidden from the list)</option>
          </NativeSelect>
        </FormField>
      )}

      <div className="grid gap-2">
        <Label>Colour</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <FormField id="description" label="Description (optional)">
        <Textarea name="description" defaultValue={project?.description ?? ""} maxLength={8000} placeholder="Scope, site address, key contacts…" />
      </FormField>

      {mode === "create" && people.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Who works on this project?</legend>
          <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border p-1 sm:grid-cols-2">
            {people
              .filter((p) => p.id !== meId)
              .map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={members.includes(p.id)}
                      onChange={(e) => setMembers((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
                    />
                    <UserAvatar person={p} src={p.avatar_src} size={30} />
                    <span className="min-w-0 truncate text-sm">
                      {fullName(p)} <span className="text-muted-foreground capitalize">· {p.role}</span>
                    </span>
                  </label>
                </li>
              ))}
          </ul>
          <p className="text-sm text-muted-foreground">You&apos;re added automatically. You can change this later in Settings.</p>
        </fieldset>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {mode === "create" ? "Create project" : "Save changes"}
        </Button>
        {mode === "create" && (
          <Button type="button" size="lg" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
