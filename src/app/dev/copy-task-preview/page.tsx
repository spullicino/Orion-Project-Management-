"use client";

import { notFound } from "next/navigation";
import { CopyTaskDialog } from "@/components/board/copy-task-dialog";
import { previewBoard } from "@/dev/fixtures";

/** Development-only preview of the "Copy to other projects" form. */
export default function CopyTaskPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const task = previewBoard.tasks.find((t) => t.id === "t8")!;
  const targets = [
    { id: "p2", name: "Mosta Solar Installation", color: "#ea580c", groups: [{ id: "g1", name: "Survey" }, { id: "g2", name: "In progress" }] },
    { id: "p3", name: "Sliema Apartment Refurbishment", color: "#16a34a", groups: [{ id: "g3", name: "Planning" }] },
    { id: "p4", name: "Gozo Villa Extension", color: "#7c3aed", groups: [{ id: "g4", name: "Admin" }, { id: "g5", name: "Works" }] },
  ];
  return <CopyTaskDialog task={task} groupName="In progress" open onClose={() => {}} initialTargets={targets} />;
}
