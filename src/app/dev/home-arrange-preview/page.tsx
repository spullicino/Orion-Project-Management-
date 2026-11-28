import { notFound } from "next/navigation";
import { HomeCards } from "@/components/home/home-cards";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_ORDER, HOME_CARD_LABEL, type HomeCardId } from "@/lib/home-layout";

/** Development-only: Home's arrangeable cards with placeholder content. */
export default function HomeArrangePreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const card = (id: HomeCardId) => (
    <Card>
      <CardContent className="p-5 text-lg font-semibold">{HOME_CARD_LABEL[id]}</CardContent>
    </Card>
  );
  return <HomeCards initial={{ order: DEFAULT_ORDER, hidden: [] }} cards={DEFAULT_ORDER.map((id) => ({ id, node: id === "attention" ? null : card(id) }))} />;
}
