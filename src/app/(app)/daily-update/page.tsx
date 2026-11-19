import { ClipboardPenLine } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Daily Update" };

export default function DailyUpdatePage() {
  return (
    <>
      <PageHeader title="Daily Update" />
      <ComingSoon icon={ClipboardPenLine} title="Site diary with photos" phase={4}>
        Post what you did today, hours and any issues, with photos straight from your phone camera. Works offline.
      </ComingSoon>
    </>
  );
}
