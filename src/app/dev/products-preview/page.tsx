"use client";

import { notFound } from "next/navigation";
import { ProductsView } from "@/components/products/products-view";

/** Development-only preview of the Products page (no database). */
export default function ProductsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Products</h1>
      <ProductsView
        initial={[
          { id: "pr1", name: "Plasterboard 12.5mm", unit: "sheets", category: "Drylining", code: null, active: true },
          { id: "pr2", name: "Plasterboard 15mm", unit: "sheets", category: "Drylining", code: null, active: true },
          { id: "pr3", name: "Drywall screws 3.5x25", unit: "boxes", category: "Fixings", code: "DS25", active: true },
          { id: "pr4", name: "Twin & earth cable 2.5mm", unit: "rolls", category: "Electrical", code: "TE25", active: true },
          { id: "pr6", name: "Old fitting", unit: "pcs", category: "Plumbing", code: null, active: false },
        ]}
      />
    </main>
  );
}
