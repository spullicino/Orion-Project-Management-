import { notFound } from "next/navigation";
import { ProjectsBrowser } from "@/components/projects/projects-browser";
import type { ProjectSummary } from "@/types/board";

/** Development-only: the Projects list (Cards / List, search) with sample data. */
export default function ProjectsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const p = (id: string, name: string, color: string, done: number, total: number, level: "red" | "amber" | "green", overdue = 0, client: string | null = null, code: string | null = null): ProjectSummary => ({
    id, name, code, description: null, client_id: null, client: client ? { id: "c", name: client } : null, status: "active", start_date: null, end_date: overdue ? "2027-03-26" : null,
    color, is_template: false, hidden_columns: [], created_at: "2026-01-01", health: { level, red: 0, amber: 0, open: total - done, past_end: false },
    task_count: total, done_count: done, overdue_count: overdue, avg_progress: 0, member_ids: ["a", "b", "c"],
  });
  const projects = [
    p("1", "Improvement of Application", "#2d57a3", 13, 16, "green"),
    p("2", "OG5274 - Bonnici 132kV Mosta DC to Maghtab DC", "#2d57a3", 0, 0, "green"),
    p("3", "OG5371 - San Guzepp", "#2d57a3", 0, 10, "green"),
    p("4", "OG5376 - Solair Apartments", "#2d57a3", 1, 44, "red", 17, null, "OG5376"),
    p("5", "OG5545 - Embark - Qormi", "#4fb3e8", 0, 0, "green", 0, null, "OG5545"),
    p("6", "OG5616 - OG5709 - Cecil Hotel Valletta - Allelon", "#d23b32", 0, 1, "amber", 0, "Allelon Ltd.", "OG5616 - OG5709"),
  ];
  return <ProjectsBrowser projects={projects} empty={null} />;
}
