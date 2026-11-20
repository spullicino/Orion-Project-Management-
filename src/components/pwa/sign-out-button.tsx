"use client";

import { LogOut } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { clearOfflineData } from "./sw-register";

/** Signs out and removes this person's saved (offline) pages from the device first. */
export function SignOutButton({ className, variant = "outline", withIcon = true }: { className?: string; variant?: ButtonProps["variant"]; withIcon?: boolean }) {
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await clearOfflineData();
        form.submit();
      }}
    >
      <Button type="submit" variant={variant} className={className ?? "w-full"}>
        {withIcon && <LogOut aria-hidden />}
        Sign out
      </Button>
    </form>
  );
}
