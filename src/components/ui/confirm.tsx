"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Options = {
  body?: string;
  confirmLabel?: string;
  /** For things that can't be undone: the person must type this exactly (e.g. the project's name). */
  typeToConfirm?: string;
  /** "safe" for non-destructive questions (e.g. Send, Restore): a normal blue button. */
  tone?: "danger" | "safe";
  /** Text of the safe button (default "Cancel"). */
  cancelLabel?: string;
};
type State = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  typeToConfirm?: string;
  tone: "danger" | "safe";
  resolve: (ok: boolean) => void;
};

const same = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() ===
  b.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A friendly "are you sure?" dialog that works well on phones (unlike window.confirm).
 * "Cancel" is the safe default: the red button must be tapped on purpose.
 */
export function useConfirm() {
  const [state, setState] = useState<State | null>(null);
  const [typed, setTyped] = useState("");
  const confirm = (title: string, opts: Options = {}) =>
    new Promise<boolean>((resolve) => {
      setTyped("");
      setState({
        title,
        body: opts.body,
        confirmLabel: opts.confirmLabel ?? "Delete",
        cancelLabel: opts.cancelLabel ?? "Cancel",
        typeToConfirm: opts.typeToConfirm,
        tone: opts.tone ?? "danger",
        resolve,
      });
    });
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const blocked = !!state?.typeToConfirm && !same(typed, state.typeToConfirm);
  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && close(false)}>
      {state && (
        <DialogContent title={state.title} description={state.body}>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!blocked) close(true);
            }}
          >
            {state.typeToConfirm && (
              <label className="grid gap-1 text-sm">
                <span>
                  To confirm, type{" "}
                  <strong className="break-words">{state.typeToConfirm}</strong>
                </span>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={typed.length > 0 && blocked}
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                autoFocus={!state.typeToConfirm}
                onClick={() => close(false)}
              >
                {state.cancelLabel}
              </Button>
              <Button
                type="submit"
                variant={state.tone === "safe" ? "default" : "destructive"}
                disabled={blocked}
              >
                {state.confirmLabel}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
  return { confirm, dialog };
}
