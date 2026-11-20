"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps an open board up to date: when anyone changes a task, group or status
 * in this project, the page quietly reloads its data. Realtime respects RLS,
 * so people only get notified about rows they can see.
 */
export function RealtimeRefresh({ projectId }: { projectId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 600);
    };
    const byProject = `project_id=eq.${projectId}`;
    const channel = supabase
      .channel(`board:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: byProject }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups", filter: byProject }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "status_labels", filter: byProject }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones", filter: byProject }, refresh)
      .subscribe();
    // Also catch up when the phone wakes up / the tab becomes visible again.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [projectId, router]);
  return null;
}
