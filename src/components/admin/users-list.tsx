"use client";

import { Search, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { changeRole, setUserStatus } from "@/app/(app)/admin/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/types/database";
import { EditNameButton } from "./edit-name";
import { RoleSelect } from "./role-select";
import { useAction } from "./use-action";

function UserRow({ user, avatarUrl, isMe }: { user: Profile; avatarUrl: string | null; isMe: boolean }) {
  const { pending, run } = useAction();
  const deactivated = user.status === "deactivated";
  const { confirm, dialog } = useConfirm();
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      {dialog}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar person={user} src={avatarUrl} size={40} className={deactivated ? "opacity-50" : undefined} />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2 font-medium">
            <span className="truncate">{fullName(user)}</span>
            {isMe && <Badge variant="secondary" className="shrink-0">You</Badge>}
            {!user.first_name?.trim() && <Badge variant="warning" className="shrink-0 whitespace-nowrap">No name yet</Badge>}
            {deactivated && <Badge variant="destructive" className="shrink-0">Deactivated</Badge>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <EditNameButton user={user} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-[340px]">
        <RoleSelect
          label={`Level for ${fullName(user)}`}
          value={user.role}
          disabled={pending || isMe || deactivated}
          onChange={(role) => run(() => changeRole({ userId: user.id, role }))}
        />
        {!isMe &&
          (deactivated ? (
            <Button variant="outline" disabled={pending} onClick={() => run(() => setUserStatus({ userId: user.id, status: "active" }))}>
              <UserPlus aria-hidden />
              Reactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={async () => {
                if (await confirm(`Deactivate ${fullName(user)}?`, { body: "They will no longer be able to sign in. You can reactivate them at any time.", confirmLabel: "Deactivate" }))
                  run(() => setUserStatus({ userId: user.id, status: "deactivated" }));
              }}
            >
              <UserMinus aria-hidden />
              Deactivate
            </Button>
          ))}
      </div>
    </li>
  );
}

export function UsersList({ users, avatarUrls, meId }: { users: Profile[]; avatarUrls: Record<string, string | null>; meId: string }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => `${fullName(u)} ${u.email} ${u.role}`.toLowerCase().includes(term));
  }, [q, users]);

  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="pl-9" />
      </div>
      <ul className="divide-y">
        {filtered.map((u) => (
          <UserRow key={u.id} user={u} avatarUrl={avatarUrls[u.id] ?? null} isMe={u.id === meId} />
        ))}
      </ul>
      {!filtered.length && <p className="py-4 text-muted-foreground">No one matches “{q}”.</p>}
    </div>
  );
}
