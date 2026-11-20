import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiaryFeed } from "@/components/diary/diary-feed";
import { Button } from "@/components/ui/button";
import { can, hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { getDailyFeed } from "@/lib/data/diary";
import { getBoard } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Diary" };

export default async function DiaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [me, board] = await Promise.all([requireActiveProfile(), getBoard(projectId).catch(() => null)]);
  if (!board) notFound();
  const updates = await getDailyFeed({ project: projectId, limit: 20 });
  const isMember = board.members.some((m) => m.user_id === me.id);
  const canPost = can.postDailyUpdate(me.role) && (hasRole(me.role, "manager") || isMember);
  return (
    <div className="grid gap-4">
      {canPost && (
        <Button asChild className="justify-self-start">
          <Link href={`/daily-update?project=${projectId}`}>
            <Plus aria-hidden /> Post today&apos;s update
          </Link>
        </Button>
      )}
      <DiaryFeed
        initial={updates}
        baseQuery={{ project: projectId }}
        me={{ id: me.id, isManager: hasRole(me.role, "manager") }}
        people={board.members}
        emptyText="No daily updates for this project yet."
      />
    </div>
  );
}
