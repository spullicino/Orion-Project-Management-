import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardProvider } from "@/components/board/board-context";
import { ProjectTabs } from "@/components/board/project-tabs";
import { RealtimeRefresh } from "@/components/board/realtime-refresh";
import { TaskDrawer } from "@/components/board/task-drawer";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { getBoard } from "@/lib/data/projects";
import { formatDate } from "@/lib/utils";

const STATUS_LABEL = { active: null, on_hold: "On hold", completed: "Completed", archived: "Archived" } as const;

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const me = await requireActiveProfile();
  let board: Awaited<ReturnType<typeof getBoard>>;
  try {
    board = await getBoard(projectId);
  } catch (e) {
    if (e instanceof DatabaseUpdateNeeded) return <DatabaseUpdateNotice isAdmin={me.role === "admin"} />;
    throw e;
  }
  if (!board) notFound();

  const isMember = board.members.some((m) => m.user_id === me.id);
  const canManage = hasRole(me.role, "manager");
  const perms = {
    canManage,
    canEdit: canManage || (me.role === "technician" && isMember),
    meId: me.id,
    role: me.role,
  };
  const p = board.project;

  return (
    <BoardProvider board={board} perms={perms}>
      <RealtimeRefresh projectId={p.id} />
      <div className="mb-3">
        <Link href={p.is_template ? "/projects?view=templates" : "/projects"} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {p.is_template ? "Templates" : "All projects"}
        </Link>
      </div>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <span className="mt-1.5 size-4 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            {p.name}
            {p.is_template && <Badge variant="secondary">Template</Badge>}
            {STATUS_LABEL[p.status] && <Badge variant="secondary">{STATUS_LABEL[p.status]}</Badge>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[p.client?.name, p.code, p.start_date && p.end_date ? `${formatDate(p.start_date)} – ${formatDate(p.end_date)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {board.members.length > 0 && (
          <div className="flex items-center" title={`${board.members.length} people on this project`}>
            {board.members.slice(0, 5).map((m, i) => (
              <UserAvatar key={m.user_id} person={m} src={m.avatar_src} size={32} className={i ? "-ml-2 ring-2 ring-background" : "ring-2 ring-background"} />
            ))}
            {board.members.length > 5 && (
              <span className="-ml-2 inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold ring-2 ring-background">
                +{board.members.length - 5}
              </span>
            )}
          </div>
        )}
      </header>
      {!perms.canEdit && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">You can view this project but not change it.</p>
      )}
      <ProjectTabs projectId={p.id} canManage={canManage} />
      {children}
      <TaskDrawer />
    </BoardProvider>
  );
}
