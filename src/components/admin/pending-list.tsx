"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { approveUser, setUserStatus } from "@/app/(app)/admin/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDate, fullName } from "@/lib/utils";
import type { AppRole, Profile } from "@/types/database";
import { EditNameButton } from "./edit-name";
import { RoleSelect } from "./role-select";
import { useAction } from "./use-action";

function PendingRow({ user, avatarUrl }: { user: Profile; avatarUrl: string | null }) {
  const [role, setRole] = useState<AppRole>("technician");
  const { pending, run } = useAction();
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar person={user} src={avatarUrl} size={44} />
        <div className="min-w-0">
          <p className="truncate font-medium">{fullName(user)}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">Signed up {formatDate(user.created_at)}</p>
        </div>
        <EditNameButton user={user} />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:w-auto">
        <RoleSelect label={`Level for ${fullName(user)}`} value={role} onChange={setRole} disabled={pending} />
        <Button onClick={() => run(() => approveUser({ userId: user.id, role }))} disabled={pending}>
          <Check aria-hidden />
          Approve
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Decline ${fullName(user)}`}
          title="Decline"
          onClick={() => run(() => setUserStatus({ userId: user.id, status: "deactivated" }))}
          disabled={pending}
        >
          <X aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function PendingList({ users, avatarUrls }: { users: Profile[]; avatarUrls: Record<string, string | null> }) {
  if (!users.length) return <p className="text-muted-foreground">Nobody is waiting for approval.</p>;
  return (
    <ul className="grid gap-3">
      {users.map((u) => (
        <PendingRow key={u.id} user={u} avatarUrl={avatarUrls[u.id] ?? null} />
      ))}
    </ul>
  );
}
