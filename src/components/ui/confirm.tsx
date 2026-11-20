"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** A friendly "are you sure?" dialog that works well on phones (unlike window.confirm). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: string; confirmLabel: string; resolve: (ok: boolean) => void } | null>(null);
  const confirm = (title: string, opts: { body?: string; confirmLabel?: string } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, body: opts.body, confirmLabel: opts.confirmLabel ?? "Delete", resolve }));
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && close(false)}>
      {state && (
        <DialogContent title={state.title} description={state.body}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => close(true)}>
              {state.confirmLabel}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
  return { confirm, dialog };
}
