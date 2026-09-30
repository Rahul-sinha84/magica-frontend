"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { LayoutSidebarIcon } from "@/components/icons";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { cn } from "@/lib/utils";
import { useMobileSidebar, useUiStore } from "@/stores/uiStore";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarNav } from "./SidebarNav";
import { SidebarTasks } from "./SidebarTasks";

const round =
  "flex size-7 items-center justify-center rounded-full text-icon-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";

function Wordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/magica-wordmark.png"
      alt="Magica"
      width={80}
      height={20}
      priority
      className={cn("h-5 w-20 max-w-none object-contain object-left dark:invert", className)}
    />
  );
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileOpen = useMobileSidebar((s) => s.open);
  const setMobileOpen = useMobileSidebar((s) => s.setOpen);
  // the icon rail only exists on desktop; the mobile drawer is always the full sidebar
  const rail = collapsed && isDesktop;

  // close the drawer when you navigate
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
      // ⌘⇧O / Ctrl⇧O starts a new task, as on magica.com
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        router.push("/chat");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, setMobileOpen]);

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        aria-label="Sidebar"
        inert={!isDesktop && !mobileOpen}
        className={cn(
          "fixed inset-y-2 left-2 z-40 flex w-60 shrink-0 flex-col overflow-hidden rounded-3xl bg-surface-main-2 shadow-[inset_0_0_0_1px_var(--line-tertiary)] transition-[transform,width] duration-200 motion-reduce:transition-none md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
          rail && "md:w-12",
        )}
      >
        {rail ? (
          <div className="flex flex-col items-center pt-2">
            <button
              type="button"
              aria-label="Open sidebar"
              onClick={toggle}
              className="flex size-[34px] items-center justify-center rounded-lg outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block size-5 overflow-hidden">
                <Wordmark />
              </span>
            </button>
            <button type="button" aria-label="Search" title="Not available in this build" aria-disabled="true" className={cn(round, "mb-1 mt-4")}>
              <Search className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex h-[52px] shrink-0 items-center justify-between pl-3 pr-2">
            <Link
              href="/chat"
              aria-label="Start a new task"
              className="flex h-8 w-[84px] items-center rounded-lg px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Wordmark />
            </Link>
            <div className="flex items-center gap-0.5">
              <button type="button" aria-label="Search" title="Not available in this build" aria-disabled="true" className={round}>
                <Search className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Close sidebar"
                onClick={isDesktop ? toggle : () => setMobileOpen(false)}
                className={round}
              >
                <LayoutSidebarIcon className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* nav and tasks scroll together on short screens; the header and footer stay put */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav rail={rail} />
          {!rail && (
            <div className="mt-2 px-2">
              <SidebarTasks />
            </div>
          )}
        </div>
        <SidebarFooter rail={rail} />
      </aside>
    </>
  );
}
