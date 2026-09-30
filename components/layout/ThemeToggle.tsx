"use client";

import { useSyncExternalStore } from "react";
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

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex h-[30px] w-full rounded-full border border-line-secondary p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mounted && theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={cn(
            "grid flex-1 place-items-center rounded-full text-icon-secondary transition-colors hover:text-icon-primary",
            mounted && theme === value && "bg-surface-tertiary text-icon-primary",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
