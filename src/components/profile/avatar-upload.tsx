"use client";

import imageCompression from "browser-image-compression";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { createAvatarUpload, saveAvatar } from "@/app/(app)/profile/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export function AvatarUpload({ profile, avatarUrl }: { profile: Profile; avatarUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const router = useRouter();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      // Shrink on the phone before uploading: faster on mobile data.
      const small = await imageCompression(file, {
        maxWidthOrHeight: 512,
        maxSizeMB: 0.4,
        fileType: "image/jpeg",
        initialQuality: 0.85,
        useWebWorker: true,
      });
      const ticket = await createAvatarUpload({ contentType: "image/jpeg", size: small.size });
      if ("error" in ticket) throw new Error(ticket.error);
      const { error } = await createClient()
        .storage.from("avatars")
        .uploadToSignedUrl(ticket.path, ticket.token, small, { contentType: "image/jpeg" });
      if (error) throw new Error("Upload failed. Check your connection and try again.");
      const saved = await saveAvatar(ticket.path);
      if (saved.error) throw new Error(saved.error);
      setPreview(URL.createObjectURL(small));
      toast.success("Photo updated");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't update your photo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const res = await saveAvatar(null);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar person={profile} src={preview} size={80} />
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id="avatar-file"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
          {preview ? "Change photo" : "Add photo"}
        </Button>
        {preview && (
          <Button type="button" variant="ghost" onClick={remove} disabled={busy}>
            <Trash2 aria-hidden />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
