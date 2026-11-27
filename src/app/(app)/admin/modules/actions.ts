"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const input = z.object({ userId: z.string().uuid(), module: z.enum(["aftersales"]), level: z.enum(["agent", "manager"]).nullable() });

/** Administrators: give someone access to a module (Agent / Manager) or take it away (null). */
export async function setModuleAccess(raw: unknown): Promise<Result> {
  const me = await requireRole("admin");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid choice" };
  const { userId, module, level } = parsed.data;
  const supabase = await createClient();
  const { error } = level
    ? await supabase.from("module_access").upsert({ user_id: userId, module, level, granted_by: me.id }, { onConflict: "user_id,module" })
    : await supabase.from("module_access").delete().eq("user_id", userId).eq("module", module);
  if (error) return { ok: false, error: /does not exist|schema cache/.test(error.message) ? "Run database update 0033 first." : error.message };
  revalidatePath("/admin/modules");
  revalidatePath("/", "layout");
  return { ok: true };
}
