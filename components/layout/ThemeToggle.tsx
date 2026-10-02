"use client";

import { useSyncExternalStore, type KeyboardEvent } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "System theme", Icon: Laptop },
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
] as const;

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // next-themes can't know the stored theme on the server; wait for the client
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const selected = mounted ? theme : undefined;
  const known = OPTIONS.some((option) => option.value === selected);

  // arrow keys move the selection, like any radio group
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.value === selected);
    const next = OPTIONS[(Math.max(index, 0) + step + OPTIONS.length) % OPTIONS.length];
    setTheme(next.value);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
      className="flex h-8 w-full rounded-full border-2 border-line-tertiary bg-surface-main p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }, index) => {
        const checked = selected === value;
        // only one radio is in the tab order; before a choice is known, the first is
        const focusable = known ? checked : index === 0;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            data-value={value}
            aria-checked={checked}
            aria-label={label}
            tabIndex={focusable ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              "grid flex-1 place-items-center rounded-full text-icon-secondary outline-none transition-colors hover:text-icon-primary focus-visible:ring-2 focus-visible:ring-ring",
              checked && "bg-surface-tertiary text-icon-primary",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
