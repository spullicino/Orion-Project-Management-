"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

/** Development-only preview of the "type the project name" confirmation. */
export default function ConfirmPreview() {
  const { confirm, dialog } = useConfirm();
  const [result, setResult] = useState("");
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {dialog}
      <Button
        variant="destructive"
        onClick={async () =>
          setResult(
            String(
              await confirm("Delete “OG5376 - Solair Apartments” forever?", {
                body: "All its tasks, comments, files, daily updates, materials and chat are deleted. This cannot be undone and can't be restored from the Recycle bin.",
                confirmLabel: "Delete forever",
                typeToConfirm: "OG5376 - Solair Apartments",
              }),
            ),
          )
        }
      >
        Delete project
      </Button>
      <p data-testid="result">{result}</p>
    </main>
  );
}
