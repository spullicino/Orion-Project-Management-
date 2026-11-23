"use client";

import { Check, PackageSearch } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/materials";

/**
 * Item name with a searchable product list: type a few letters and pick a product
 * (its unit is filled in), or keep typing for something that isn't in the list.
 */
export function ProductPicker({
  products,
  value,
  productId,
  onChange,
  label,
}: {
  products: Product[];
  value: string;
  productId: string | null;
  onChange: (v: { name: string; product: Product | null }) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const matches = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = products.filter((p) => {
      const hay = `${p.name} ${p.category ?? ""} ${p.code ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return list.slice(0, 30);
  }, [products, value]);

  const pick = (p: Product) => {
    onChange({ name: p.name, product: p });
    setOpen(false);
  };

  const showList = open && products.length > 0 && (matches.length > 0 || value.trim().length > 0);
  return (
    <div className="relative flex-1">
      <Input
        value={value}
        onChange={(e) => {
          onChange({ name: e.target.value, product: null });
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => (blurTimer.current = setTimeout(() => setOpen(false), 150))}
        onKeyDown={(e) => {
          if (!showList || !matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={products.length ? "Search products, or type an item…" : "e.g. Plasterboard 12.5mm"}
        aria-label={label}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
        maxLength={200}
        className={cn(productId && "border-emerald-600/60 pr-9")}
      />
      {productId && <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-emerald-700 dark:text-emerald-400" aria-label="From the product list" />}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Products"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()} // keep focus in the input while picking
        >
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => pick(p)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm", i === active ? "bg-accent" : "hover:bg-accent/60")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                {(p.category || p.code) && <span className="block truncate text-xs text-muted-foreground">{[p.category, p.code].filter(Boolean).join(" · ")}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.unit}</span>
            </li>
          ))}
          {!matches.length && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <PackageSearch className="size-4 shrink-0" aria-hidden /> Not in the product list — it&apos;ll be sent as you typed it.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
