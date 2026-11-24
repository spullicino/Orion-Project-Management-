"use client";

import { CalendarDays } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const shown = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${iso}T12:00:00Z`))
    : iso;

/**
 * A date box we draw ourselves, with the phone's own date picker on top (invisible).
 * iPhones (Safari and Chrome) size and pad native date boxes their own way — wider
 * than their column and extra tall when empty — so we never show the native box.
 */
export function DateInput({
  className,
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [own, setOwn] = React.useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value ?? "") : own;
  return (
    <div
      className={cn(
        "relative flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base focus-within:ring-2 focus-within:ring-ring md:text-sm",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !current && "text-muted-foreground",
        )}
      >
        {current ? shown(current) : (placeholder ?? "Choose a date")}
      </span>
      <CalendarDays
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <input
        type="date"
        value={value !== undefined ? current : undefined}
        defaultValue={value !== undefined ? undefined : defaultValue}
        disabled={disabled}
        onChange={(e) => {
          setOwn(e.target.value);
          onChange?.(e);
        }}
        onClick={(e) => {
          // Computers: open the calendar wherever the box is clicked (phones always do).
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* not supported: the browser handles the click itself */
          }
        }}
        className="absolute inset-0 size-full min-w-0 cursor-pointer text-base opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
}
