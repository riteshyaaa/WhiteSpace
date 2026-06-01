"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]'
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, filtered]);

  if (!open) return null;

  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl bg-zinc-900 shadow-2xl ring-1 ring-zinc-700"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded
          aria-controls="cmdk-list"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div
          id="cmdk-list"
          role="listbox"
          ref={listRef}
          className="max-h-80 overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              No matching commands
            </div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  i === active
                    ? "bg-blue-600 text-white"
                    : "text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`w-16 shrink-0 text-xs ${
                      i === active ? "text-blue-100" : "text-zinc-500"
                    }`}
                  >
                    {c.group}
                  </span>
                  {c.label}
                </span>
                {c.hint && (
                  <kbd
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      i === active ? "bg-blue-500/40" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {c.hint}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
