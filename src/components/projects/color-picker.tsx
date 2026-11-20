"use client";

import { Check } from "lucide-react";
import { PROJECT_COLORS } from "@/lib/validation/projects";
import { cn } from "@/lib/utils";

export function ColorPicker({ value, onChange, label = "Colour" }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === c && "ring-2 ring-foreground")}
          style={{ background: c }}
        >
          {value === c && <Check className="size-5 text-white" aria-hidden />}
        </button>
      ))}
    </div>
  );
}
