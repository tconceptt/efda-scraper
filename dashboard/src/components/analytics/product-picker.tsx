"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchProducts } from "@/app/analytics/actions";
import type { ProductSearchResult } from "@/lib/queries";

interface ProductPickerProps {
  value: string | null;
  displayName: string | null;
  onSelect: (slug: string | null, name: string | null) => void;
}

export function ProductPicker({ value, displayName, onSelect }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await searchProducts(q);
      setResults(data);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const formatLabel = (r: ProductSearchResult) => {
    const parts = [r.generic_name];
    if (r.dosage_strength) parts.push(r.dosage_strength);
    if (r.dosage_form) parts.push(r.dosage_form);
    return parts.join(" — ");
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[280px] justify-between text-sm font-normal"
          >
            <span className="truncate">
              {displayName ?? "Filter by product..."}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search products..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {searching && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              )}
              {!searching && query.length >= 2 && results.length === 0 && (
                <CommandEmpty>No products found.</CommandEmpty>
              )}
              {!searching && query.length < 2 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </div>
              )}
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem
                      key={r.slug}
                      value={r.slug}
                      onSelect={() => {
                        onSelect(r.slug, formatLabel(r));
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check
                        className={`mr-2 size-4 ${value === r.slug ? "opacity-100" : "opacity-0"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{r.generic_name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[r.dosage_form, r.dosage_strength].filter(Boolean).join(" · ")}
                          {" · "}
                          {r.order_count} orders
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => onSelect(null, null)}
        >
          <X className="size-4" />
          <span className="sr-only">Clear product</span>
        </Button>
      )}
    </div>
  );
}
