"use client";

import { Camera, Paperclip, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

/** Take a photo or choose files (up to 10), shown as removable chips. */
export function AttachFiles({ files, onChange, disabled }: { files: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const add = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, 10));
    e.target.value = "";
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={add} />
        <input ref={pick} type="file" multiple className="hidden" onChange={add} />
        <Button type="button" variant="outline" onClick={() => camera.current?.click()} disabled={disabled}>
          <Camera aria-hidden /> Take photo
        </Button>
        <Button type="button" variant="outline" onClick={() => pick.current?.click()} disabled={disabled}>
          <Paperclip aria-hidden /> Add files
        </Button>
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex h-9 max-w-full items-center gap-1 rounded-full border bg-muted/50 pl-3 text-sm">
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center">
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
