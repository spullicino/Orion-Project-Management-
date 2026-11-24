"use client";

import {
  Archive,
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  importProducts,
  saveProduct,
  setProductActive,
} from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  parseProductLines,
  rowsToProducts,
  type ProductRow,
} from "@/lib/products";
import { COMMON_UNITS, type Product } from "@/types/materials";

type Draft = { name: string; unit: string; category: string; code: string };

export function ProductsView({ initial }: { initial: Product[] }) {
  const [products, setProducts] = useState(initial);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const categories = useMemo(
    () =>
      [
        ...new Set(
          products.map((p) => p.category).filter((c): c is string => !!c),
        ),
      ].sort(),
    [products],
  );
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products
      .filter((p) => (showRetired ? true : p.active))
      .filter((p) => !category || p.category === category)
      .filter((p) =>
        words.every((w) =>
          `${p.name} ${p.code ?? ""} ${p.category ?? ""}`
            .toLowerCase()
            .includes(w),
        ),
      )
      .sort(
        (a, b) =>
          (a.category ?? "~").localeCompare(b.category ?? "~") ||
          a.name.localeCompare(b.name),
      );
  }, [products, q, category, showRetired]);

  const upsert = (p: Product) =>
    setProducts((ps) =>
      ps.some((x) => x.id === p.id)
        ? ps.map((x) => (x.id === p.id ? p : x))
        : [...ps, p],
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Add product
        </Button>
        <Button variant="outline" onClick={() => setImporting(true)}>
          <FileSpreadsheet aria-hidden /> Import from Excel
        </Button>
        <Button
          variant="outline"
          onClick={() => exportProducts(products, showRetired)}
          disabled={!products.length}
        >
          <Download aria-hidden /> Export to Excel
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="pl-9"
          />
        </div>
        {categories.length > 0 && (
          <div className="w-48">
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <label className="flex h-11 items-center gap-2 text-sm">
          <Switch checked={showRetired} onCheckedChange={setShowRetired} /> Show
          retired
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        {products.filter((p) => p.active).length} products in the list. Workers
        pick from these when they request materials.
      </p>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {products.length
            ? "No products match."
            : "No products yet. Add them one by one, or import a list from Excel."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                !p.active && "opacity-60",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[p.unit, p.category, p.code, p.active ? null : "Retired"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(p)}
                aria-label={`Edit ${p.name}`}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  p.active ? `Retire ${p.name}` : `Bring back ${p.name}`
                }
                title={p.active ? "Retire (hide from requests)" : "Bring back"}
                onClick={async () => {
                  const res = await setProductActive(p.id, !p.active);
                  if (!res.ok) return void toast.error(res.error);
                  upsert({ ...p, active: !p.active });
                  toast.success(
                    p.active
                      ? "Retired — it won't be offered in new requests"
                      : "Back in the list",
                  );
                }}
              >
                {p.active ? <Archive /> : <ArchiveRestore />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            upsert(p);
            setEditing(null);
          }}
        />
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

/** Downloads the list as an .xlsx with the same columns the import reads, so people can add rows and upload it back. */
async function exportProducts(products: Product[], includeRetired: boolean) {
  try {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const list = products
      .filter((p) => includeRetired || p.active)
      .sort(
        (a, b) =>
          (a.category ?? "~").localeCompare(b.category ?? "~") ||
          a.name.localeCompare(b.name),
      );
    const head = [
      "Name",
      "Unit",
      "Category",
      "Code",
      ...(includeRetired ? ["Status"] : []),
    ].map((value) => ({ value, fontWeight: "bold" as const }));
    const rows = list.map((p) =>
      [
        p.name,
        p.unit,
        p.category ?? "",
        p.code ?? "",
        ...(includeRetired ? [p.active ? "Active" : "Retired"] : []),
      ].map((value) => ({ value })),
    );
    const day = new Date().toLocaleDateString("en-CA");
    await writeXlsxFile([head, ...rows], {
      sheet: "Products",
      columns: [
        { width: 40 },
        { width: 10 },
        { width: 20 },
        { width: 16 },
        { width: 10 },
      ],
      stickyRowsCount: 1,
    }).toFile(`orion-products-${day}.xlsx`);
    toast.success(`Exported ${list.length} products`);
  } catch {
    toast.error("Couldn't create the Excel file. Please try again.");
  }
}

function ProductDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: string[];
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [d, setD] = useState<Draft>({
    name: product?.name ?? "",
    unit: product?.unit ?? "pcs",
    category: product?.category ?? "",
    code: product?.code ?? "",
  });
  const [busy, setBusy] = useState(false);
  const custom = !COMMON_UNITS.includes(d.unit);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={product ? "Edit product" : "Add product"}
        description="Workers will see it in the list when they request materials."
      >
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await saveProduct(product?.id ?? null, {
              name: d.name,
              unit: d.unit,
              category: d.category || null,
              code: d.code || null,
            });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success(product ? "Product saved" : "Product added");
            onSaved(res.data!);
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Name
            <Input
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="e.g. Plasterboard 12.5mm"
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm font-medium">
              Unit
              <NativeSelect
                value={custom ? "other" : d.unit}
                onChange={(e) =>
                  setD({
                    ...d,
                    unit: e.target.value === "other" ? "" : e.target.value,
                  })
                }
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="other">Other…</option>
              </NativeSelect>
            </label>
            {custom && (
              <label className="grid gap-1 text-sm font-medium">
                Other unit
                <Input
                  value={d.unit}
                  onChange={(e) => setD({ ...d, unit: e.target.value })}
                  maxLength={20}
                  required
                />
              </label>
            )}
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Category (optional)
            <Input
              value={d.category}
              onChange={(e) => setD({ ...d, category: e.target.value })}
              placeholder="e.g. Electrical, Plumbing, Drylining"
              maxLength={60}
              list="product-categories"
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Product code (optional)
            <Input
              value={d.code}
              onChange={(e) => setD({ ...d, code: e.target.value })}
              maxLength={60}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !d.name.trim() || !d.unit.trim()}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ name: string; rows: ProductRow[] } | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pasted = useMemo(() => parseProductLines(text), [text]);
  const rows = file ? file.rows : pasted;

  const readFile = async (f: File) => {
    setReading(true);
    try {
      let found: ProductRow[];
      if (/\.(csv|txt|tsv)$/i.test(f.name))
        found = parseProductLines(await f.text());
      else {
        const { default: readXlsxFile } =
          await import("read-excel-file/browser");
        const sheets = await readXlsxFile(f);
        // Use the first sheet that has products in it.
        found =
          sheets.map((s) => rowsToProducts(s.data)).find((r) => r.length) ?? [];
      }
      setFile({ name: f.name, rows: found });
      if (!found.length)
        toast.error(
          "No products found in that file. Put the names in a column titled Name.",
        );
    } catch {
      toast.error(
        "Couldn't read that file. Save it as .xlsx or .csv and try again.",
      );
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Import products from Excel"
        description="Upload an Excel (.xlsx) or CSV file with the columns Name, Unit, Category and Code — or copy the cells in Excel and paste them below. Products already in the list are skipped."
        className="max-w-xl"
      >
        <div className="grid gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
            >
              {reading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Upload aria-hidden />
              )}{" "}
              Choose Excel or CSV file
            </Button>
            {file && (
              <span className="flex min-w-0 items-center gap-1 text-sm">
                <span className="truncate font-medium">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  Remove
                </Button>
              </span>
            )}
          </div>
          {!file && (
            <p className="text-xs text-muted-foreground">
              Tip: use Export to Excel to get a file in the right layout, add
              your new products at the bottom, then upload it here.
            </p>
          )}
          {!file && (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              aria-label="Products to import"
              placeholder={
                "Plasterboard 12.5mm\tsheets\tDrylining\nTwin & earth cable 2.5mm\trolls\tElectrical\tTE25"
              }
              className="font-mono text-sm"
            />
          )}
          {rows.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border text-sm">
              <table className="w-full">
                <caption className="sr-only">Preview</caption>
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.unit}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2">{r.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-sm text-muted-foreground">
              {rows.length ? `${rows.length} products found` : ""}
            </span>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || !rows.length}
              onClick={async () => {
                setBusy(true);
                const res = await importProducts(rows);
                setBusy(false);
                if (!res.ok) return void toast.error(res.error);
                toast.success(
                  `${res.data!.added} added${res.data!.skipped ? `, ${res.data!.skipped} already in the list` : ""}`,
                );
                onDone();
              }}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />} Import{" "}
              {rows.length || ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
