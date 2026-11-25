import { describe, expect, it } from "vitest";
import { describeAudit } from "@/lib/audit";

describe("audit log sentences", () => {
  it("describes task changes in plain words", () => {
    expect(describeAudit({ entity: "task", action: "deleted", title: "Partition walls", changes: {} })).toBe("deleted task “Partition walls”");
    expect(describeAudit({ entity: "task", action: "updated", title: "Partition walls", changes: { status: ["Working on it", "Done"], progress: [40, 60], due_date: [null, "2026-11-30"] } })).toBe(
      "changed task “Partition walls”: status Working on it → Done, progress 40% → 60%, due date none → 30/11/2026",
    );
    expect(describeAudit({ entity: "task", action: "assigned", title: "Partition walls", changes: { person: "Joe Vella" } })).toBe("assigned Joe Vella to task “Partition walls”");
    expect(describeAudit({ entity: "task", action: "updated", title: "X", changes: { description: ["…", "edited"] } })).toBe("changed task “X”: edited the description");
  });

  it("describes other things", () => {
    expect(describeAudit({ entity: "group", action: "deleted", title: "Snagging", changes: { tasks_deleted: 3 } })).toBe("deleted group “Snagging” and its 3 tasks");
    expect(describeAudit({ entity: "user", action: "updated", title: "Joe Vella", changes: { role: ["technician", "manager"] } })).toBe("changed Joe Vella's details: level Technician → Manager");
    expect(describeAudit({ entity: "material_request", action: "updated", title: "Material request #12", changes: { status: ["requested", "ordered"] } })).toBe(
      "changed Material request #12: status Requested → Ordered",
    );
    expect(describeAudit({ entity: "project_member", action: "removed", title: "Joe Vella", changes: {} })).toBe("removed Joe Vella from the project");
  });
});
