import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="Projects" />
      <ComingSoon icon={FolderKanban} title="Boards, Kanban and My Tasks" phase={2}>
        Project boards with groups, coloured statuses, owners and due dates, plus a Kanban view and your personal task list.
      </ComingSoon>
    </>
  );
}
