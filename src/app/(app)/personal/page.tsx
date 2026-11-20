import type { Metadata } from "next";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { PersonalView } from "@/components/personal/personal-view";
import { requireActiveProfile } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/data/db-errors";
import { loadPersonal } from "./actions";

export const metadata: Metadata = { title: "Personal" };

export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, me] = await Promise.all([searchParams, requireActiveProfile()]);
  let data;
  try {
    data = await loadPersonal();
  } catch (e) {
    if (isMissingSchema({ message: (e as Error).message })) {
      return (
        <>
          <PageHeader title="Personal" />
          <DatabaseUpdateNotice isAdmin={me.role === "admin"} />
        </>
      );
    }
    throw e;
  }
  return (
    <>
      <PageHeader title="Personal" description="Your own to-dos and notes." />
      <div className="max-w-3xl">
        <PersonalView todos={data.todos} notes={data.notes} initialTab={tab === "notes" ? "notes" : "todo"} />
      </div>
    </>
  );
}
