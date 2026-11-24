"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  approveSchema,
  changeRoleSchema,
  inviteSchema,
  setNameSchema,
  setStatusSchema,
  settingsSchema,
} from "@/lib/validation/admin";
import type { AppRole, AppSettings } from "@/types/database";

export type ActionResult = { ok?: boolean; error?: string; message?: string };

const done = (message?: string): ActionResult => {
  revalidatePath("/admin");
  return { ok: true, message };
};

// All profile changes below use the signed-in admin's own session, so the
// database (RLS + guard trigger) double-checks the permission.

export async function approveUser(input: { userId: string; role: AppRole }): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "active", role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .eq("status", "pending");
  if (error) return { error: error.message };
  return done("User approved");
}

export async function changeRole(input: { userId: string; role: AppRole }): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  if (parsed.data.userId === me.id) return { error: "You can't change your own level." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role: parsed.data.role }).eq("id", parsed.data.userId);
  if (error) return { error: error.message };
  return done("Level updated");
}

/** Administrators can fill in or correct anyone's first name and surname. */
export async function setUserName(input: { userId: string; firstName: string; lastName: string }): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = setNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName })
    .eq("id", parsed.data.userId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Couldn't find that person." };
  // Names show everywhere (Home, chats, tasks…), so refresh all pages.
  revalidatePath("/", "layout");
  return done("Name saved");
}

export async function setUserStatus(input: { userId: string; status: "active" | "deactivated" }): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  if (parsed.data.userId === me.id) return { error: "You can't deactivate yourself." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status: parsed.data.status }).eq("id", parsed.data.userId);
  if (error) return { error: error.message };

  // Also block / unblock sign-in at the Auth level so existing sessions can't be refreshed.
  try {
    await createAdminClient().auth.admin.updateUserById(parsed.data.userId, {
      ban_duration: parsed.data.status === "deactivated" ? "876000h" : "none",
    });
  } catch (e) {
    console.error("auth ban update failed", e);
  }
  return done(parsed.data.status === "deactivated" ? "User deactivated" : "User reactivated");
}

export async function inviteUser(input: { email: string; role: AppRole }): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  if (!(await rateLimit("invite", me.id))) return { error: "Too many invitations. Please wait a while." };
  const { email, role } = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("profiles").select("id, status").eq("email", email).maybeSingle();
  if (existing) {
    return {
      error:
        existing.status === "pending"
          ? "This person has already signed up. Approve them in the list above."
          : "This person already has an account.",
    };
  }

  // Replace any earlier open invite for the same email.
  await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  const { error: insertError } = await supabase.from("invites").insert({ email, role, invited_by: me.id });
  if (insertError) return { error: insertError.message };

  const site = await getSiteUrl();
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${site}/auth/set-password`,
    data: { invited_role: role },
  });
  if (error) {
    await supabase.from("invites").update({ revoked_at: new Date().toISOString() }).eq("email", email).is("accepted_at", null);
    return { error: `Couldn't send the invitation: ${error.message}` };
  }
  return done(`Invitation sent to ${email}`);
}

export async function revokeInvite(input: { inviteId: string }): Promise<ActionResult> {
  await requireRole("admin");
  if (typeof input.inviteId !== "string") return { error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.inviteId)
    .is("accepted_at", null);
  if (error) return { error: error.message };
  return done("Invitation cancelled");
}

export async function updateSettings(input: { basicCanPostChat?: boolean; reminderEnabled?: boolean; reminderTime?: string }): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const d = parsed.data;
  const patch: Partial<AppSettings> = {};
  if (d.basicCanPostChat !== undefined) patch.basic_can_post_chat = d.basicCanPostChat;
  if (d.reminderEnabled !== undefined) patch.daily_reminder_enabled = d.reminderEnabled;
  if (d.reminderTime !== undefined) patch.daily_reminder_time = d.reminderTime;
  if (!Object.keys(patch).length) return { error: "Nothing to save" };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update(patch).eq("id", true);
  if (error) return { error: error.message };
  return done("Settings saved");
}

/** Admin setup helper: fresh push (VAPID) keys and a random secret, shown once to copy into Vercel. Nothing is stored. */
export async function generateSetupKeys(): Promise<{ ok: true; publicKey: string; privateKey: string; cronSecret: string } | { ok: false; error: string }> {
  await requireRole("admin");
  const webpush = await import("web-push");
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const cronSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return { ok: true, publicKey, privateKey, cronSecret };
}
