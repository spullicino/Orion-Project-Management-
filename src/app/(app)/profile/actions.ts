"use server";

import { revalidatePath } from "next/cache";
import { requireActiveProfile } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/utils";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, profileSchema } from "@/lib/validation/profile";

export type ProfileState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

export async function updateProfile(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const profile = await requireActiveProfile();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName, phone: parsed.data.phone })
    .eq("id", profile.id);
  if (error) return { error: "Couldn't save your profile. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Step 1 of an avatar upload: a short-lived URL the browser uploads the (already compressed) photo to. */
export async function createAvatarUpload(input: { contentType: string; size: number }) {
  const profile = await requireActiveProfile();
  if (!AVATAR_TYPES.includes(input.contentType as (typeof AVATAR_TYPES)[number])) {
    return { error: "Please choose a JPG, PNG or WebP photo." } as const;
  }
  if (input.size > AVATAR_MAX_BYTES) return { error: "That photo is too large (max 5 MB)." } as const;
  if (!(await rateLimit("upload", profile.id))) return { error: "Too many uploads. Please wait a few minutes." } as const;

  const ext = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("avatars").createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload is not available right now." } as const;
  return { path: data.path, token: data.token } as const;
}

/** Step 2: point the profile at the uploaded photo and remove the previous one. */
export async function saveAvatar(path: string | null) {
  const profile = await requireActiveProfile();
  if (path !== null && !path.startsWith(`${profile.id}/`)) return { error: "Invalid photo." };

  const supabase = await createClient();
  const previous = profile.avatar_url;
  const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", profile.id);
  if (error) return { error: "Couldn't save your photo." };
  if (previous && previous !== path && previous.startsWith(`${profile.id}/`)) {
    await supabase.storage.from("avatars").remove([previous]);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
