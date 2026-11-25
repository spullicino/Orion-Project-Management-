import { describe, expect, it } from "vitest";
import { quickProjectTaskSchema } from "@/lib/validation/general-tasks";

describe("adding a project task from My Tasks", () => {
  const ids = { project_id: "00000000-0000-4000-8000-000000000001", group_id: "00000000-0000-4000-8000-000000000002" };
  it("needs a project, a group and a title; people are optional", () => {
    expect(quickProjectTaskSchema.parse({ ...ids, title: " Order plasterboard " })).toMatchObject({ title: "Order plasterboard", priority: "medium", assignee_ids: [] });
    expect(quickProjectTaskSchema.safeParse({ ...ids, title: " " }).success).toBe(false);
    expect(quickProjectTaskSchema.safeParse({ project_id: ids.project_id, title: "x" }).success).toBe(false);
  });
});
