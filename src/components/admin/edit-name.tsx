"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { setUserName } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/types/database";
import { useAction } from "./use-action";

/** Administrators: pencil button to type in someone's first name and surname. */
export function EditNameButton({ user }: { user: Profile }) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(user.first_name ?? "");
  const [last, setLast] = useState(user.last_name ?? "");
  const { pending, run } = useAction();
  const who = fullName(user);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit name of ${who}`}
        title="Edit name"
        onClick={() => {
          setFirst(user.first_name ?? "");
          setLast(user.last_name ?? "");
          setOpen(true);
        }}
      >
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Edit name" description={
            <>
              For <span className="break-all">{user.email}</span>. They can still change it themselves in their Profile.
            </>
          }>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => setUserName({ userId: user.id, firstName: first, lastName: last }), () => setOpen(false));
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              First name
              <Input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={80} autoComplete="off" autoCapitalize="words" required autoFocus />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Surname (optional)
              <Input value={last} onChange={(e) => setLast(e.target.value)} maxLength={80} autoComplete="off" autoCapitalize="words" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !first.trim()}>
                {pending && <Loader2 className="animate-spin" aria-hidden />} Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
