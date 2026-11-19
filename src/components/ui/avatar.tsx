import * as React from "react";
import { cn, initials } from "@/lib/utils";

type Person = { first_name?: string | null; last_name?: string | null; email?: string | null };

/** Round avatar with initials fallback. `src` must already be a usable URL (signed or https). */
export function UserAvatar({
  person,
  src,
  size = 36,
  className,
}: {
  person: Person;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const label = [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || "User";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      title={label}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URLs change; plain img avoids optimiser cache churn
        <img src={src} alt={label} className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span aria-label={label}>{initials(person)}</span>
      )}
    </span>
  );
}
