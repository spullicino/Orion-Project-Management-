"use client";

import { useState } from "react";
import { updateSettings } from "@/app/(app)/admin/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/types/database";
import { useAction } from "./use-action";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [basicCanPost, setBasicCanPost] = useState(settings.basic_can_post_chat);
  const { pending, run } = useAction();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor="basic-chat" className="text-base">
          Basic users can post in project chats
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          When off, Basic users can read project chats but not write in them.
        </p>
      </div>
      <Switch
        id="basic-chat"
        checked={basicCanPost}
        disabled={pending}
        onCheckedChange={(v) => {
          setBasicCanPost(v);
          run(() => updateSettings({ basicCanPostChat: v }));
        }}
      />
    </div>
  );
}
