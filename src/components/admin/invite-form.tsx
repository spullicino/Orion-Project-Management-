"use client";

import { Send, X } from "lucide-react";
import { useState } from "react";
import { inviteUser, revokeInvite } from "@/app/(app)/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatDate } from "@/lib/utils";
import type { AppRole, Invite } from "@/types/database";
import { RoleSelect } from "./role-select";
import { useAction } from "./use-action";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("technician");
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => inviteUser({ email, role }), () => setEmail(""));
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email address</Label>
        <Input id="invite-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">Level</Label>
        <RoleSelect id="invite-role" label="Level" value={role} onChange={setRole} disabled={pending} />
      </div>
      <Button type="submit" disabled={pending || !email}>
        <Send aria-hidden />
        Send invite
      </Button>
    </form>
  );
}

export function OpenInvites({ invites }: { invites: Invite[] }) {
  const { pending, run } = useAction();
  const { confirm, dialog } = useConfirm();
  if (!invites.length) return null;
  return (
    <div className="mt-5">
      {dialog}
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Waiting to be accepted</h3>
      <ul className="divide-y rounded-lg border">
        {invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.email}</p>
              <p className="text-xs text-muted-foreground">Expires {formatDate(i.expires_at)}</p>
            </div>
            <Badge variant="secondary">{ROLE_LABEL[i.role]}</Badge>
            <Button variant="ghost" size="icon" aria-label={`Cancel invitation for ${i.email}`} disabled={pending} onClick={async () => {
                if (await confirm(`Cancel the invitation for ${i.email}?`, { body: "The link in their email stops working.", confirmLabel: "Cancel invitation", cancelLabel: "Keep it" }))
                  run(() => revokeInvite({ inviteId: i.id }));
              }}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
