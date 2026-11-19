"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { ROLES } from "@/lib/auth/roles";
import type { AppRole } from "@/types/database";

export function RoleSelect({
  value,
  onChange,
  disabled,
  id,
  label,
}: {
  value: AppRole;
  onChange: (role: AppRole) => void;
  disabled?: boolean;
  id?: string;
  label: string;
}) {
  return (
    <NativeSelect id={id} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as AppRole)}>
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </NativeSelect>
  );
}
