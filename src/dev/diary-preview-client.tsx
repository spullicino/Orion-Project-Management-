"use client";

// Development-only: diary screens with sample data.
import { DiaryDays } from "@/components/diary/diary-card";
import { DiaryComments } from "@/components/diary/diary-comments";
import { DailyUpdateForm } from "@/components/diary/daily-update-form";
import { OutboxPanel, OutboxProvider } from "@/components/diary/outbox-provider";
import { PhotoGallery } from "@/components/diary/photo-gallery";
import { Card, CardContent } from "@/components/ui/card";
import { buildDailyReport } from "@/lib/diary/report";
import { previewGallery, previewUpdates } from "./diary-fixtures";

export function DiaryPreviewClient({ view }: { view?: string }) {
  if (view === "gallery") return <PhotoGallery projectId="20000000-0000-4000-8000-000000000001" initial={previewGallery} />;
  if (view === "report")
    return (
      <button
        type="button"
        id="make-report"
        onClick={() => buildDailyReport(previewUpdates, { projectName: "Valletta Office Fit-out", clientName: "Harbour Holdings Ltd", from: previewUpdates[2].work_date, to: previewUpdates[0].work_date, quality: "standard" })}
      >
        Make report
      </button>
    );
  return (
    <OutboxProvider userId="preview-user">
      <OutboxPanel />
      <Card className="mb-8">
        <CardContent className="p-5">
          <DailyUpdateForm projects={[{ id: "20000000-0000-4000-8000-000000000001", name: "Valletta Office Fit-out", color: "#2d57a3" }]} />
        </CardContent>
      </Card>
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm">Comments under an update (sample):</p>
        <DiaryComments
          updateId="preview"
          count={2}
          me={{ id: "u3", isManager: false }}
          startOpen
          preview={{
            comments: [
              { id: "c1", author_id: "u1", author: "Mark Borg", body: "Did you finish the brackets on level 2? @Joe Vella can you check the soil stack?", created_at: "2026-11-27T08:15:00Z", edited_at: null },
              { id: "c2", author_id: "u3", author: "Joe Vella", body: "Yes, all done. Soil stack tomorrow morning.", created_at: "2026-11-27T10:05:00Z", edited_at: "2026-11-27T10:07:00Z" },
            ],
            people: [{ id: "u1", name: "Mark Borg" }, { id: "u4", name: "Anna Zammit" }],
          }}
        />
      </div>
      <DiaryDays updates={previewUpdates} me={{ id: "u3", isManager: false }} showProject />
    </OutboxProvider>
  );
}
