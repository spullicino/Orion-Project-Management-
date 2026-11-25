"use client";

import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MessagesView } from "@/components/admin/messages-view";
import { AnnouncementScreen } from "@/components/announcement-gate";

function Preview() {
  const screen = useSearchParams().get("screen") === "1";
  if (screen)
    return (
      <AnnouncementScreen
        message={{ id: "m1", title: "Solair site closed tomorrow", body: "Because of the crane inspection, nobody is to go to OG5376 - Solair Apartments tomorrow (Thursday).\n\nReport to the Central Bank site at 7:00 instead. Call Mark if you have any questions.", created_at: "2026-11-25T14:05:00Z", sender: "Sarah Pullicino" }}
        count={2}
        busy={false}
        onRead={() => {}}
      />
    );
  const t = "2026-11-25T14:05:00Z";
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Important messages</h1>
      <MessagesView
        people={[
          { id: "u1", name: "Joe Vella", role: "technician" },
          { id: "u2", name: "Alexander Hamburger", role: "technician" },
          { id: "u3", name: "Mark Borg", role: "manager" },
        ]}
        projects={[{ id: "p1", name: "OG5376 - Solair Apartments" }, { id: "p2", name: "OG5698 - Central Bank" }]}
        defaultRepeat={{ from: "07:00", to: "17:00", weekdaysOnly: false, days: 3 }}
        sent={[
          {
            id: "s1", title: "Solair site closed tomorrow", body: "Because of the crane inspection, nobody is to go to Solair tomorrow.", remind_every_hours: 2, created_at: t, sender: "Sarah Pullicino", repeat: { from: "07:00", to: "17:00", weekdaysOnly: true, days: 3 },
            recipients: [
              { user_id: "u2", name: "Alexander Hamburger", read_at: null, times_sent: 3 },
              { user_id: "u1", name: "Joe Vella", read_at: "2026-11-25T14:20:00Z", times_sent: 1 },
            ],
          },
        ]}
      />
    </main>
  );
}

/** Development-only preview of Admin → Important messages and the full-screen message. */
export default function MessagesPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
