"use client";

import { notFound } from "next/navigation";
import { UsersList } from "@/components/admin/users-list";
import type { Profile } from "@/types/database";

/** Development-only preview of Admin → Users (no database). */
export default function AdminPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const t = "2026-11-01T10:00:00Z";
  const p = (id: string, first: string, last: string, email: string, role: Profile["role"]): Profile => ({
    id, first_name: first, last_name: last, email, phone: null, avatar_url: null, role, status: "active", approved_by: null, approved_at: null, created_at: t, updated_at: t,
  });
  const users = [
    p("u1", "Sarah", "Pullicino", "sarah@example.com", "admin"),
    p("u2", "", "", "someone.with.a.long.address19@gmail.com", "technician"),
    p("u3", "Alexander", "Hamburger", "alex@example.com", "technician"),
    p("u4", "", "", "kevken@example.com", "basic"),
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">People</h1>
      <UsersList users={users} avatarUrls={{}} meId="u1" />
    </main>
  );
}
