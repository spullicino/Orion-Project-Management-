import { notFound } from "next/navigation";
import { PersonalView } from "@/components/personal/personal-view";
import { addDays, todayISO } from "@/lib/board";

/** Development-only visual preview of the Personal page with sample data (no database needed). */
export default async function PersonalPreview({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { tab } = await searchParams;
  const t = todayISO();
  const now = new Date().toISOString();
  const todos = [
    {
      id: "1",
      title: "Call the bank about the card",
      due_date: addDays(t, -1),
      done_at: null,
      position: 1,
      created_at: now,
    },
    {
      id: "2",
      title: "Book car service",
      due_date: t,
      done_at: null,
      position: 2,
      created_at: now,
    },
    {
      id: "3",
      title: "Prepare notes for Monday's meeting",
      due_date: addDays(t, 4),
      done_at: null,
      position: 3,
      created_at: now,
    },
    {
      id: "4",
      title: "Order new safety boots",
      due_date: null,
      done_at: null,
      position: 4,
      created_at: now,
    },
    {
      id: "5",
      title: "Renew parking permit",
      due_date: null,
      done_at: now,
      position: 5,
      created_at: now,
    },
  ];
  const notes = [
    {
      id: "a",
      title: "Ideas for the Sliema fit-out",
      body: "Ask the supplier about lead times on the glass partitions.\nCheck whether the lift can take the long panels.",
      color: "#fef9c3",
      pinned: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: "b",
      title: "Useful numbers",
      body: "Electrician – Mark\nScaffolding – Joe\nSkip hire – 2123 4567",
      color: "#dbeafe",
      pinned: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: "c",
      title: "",
      body: "Remember to bring the laser level back to the store.",
      color: "#ffffff",
      pinned: false,
      created_at: now,
      updated_at: now,
    },
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      <h1 className="mb-4 text-2xl font-bold">Personal</h1>
      <PersonalView
        todos={todos}
        notes={notes}
        initialTab={tab === "notes" ? "notes" : "todo"}
      />
    </main>
  );
}
