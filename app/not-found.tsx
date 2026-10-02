import Link from "next/link";
import { ArrowRight, House, MessageSquare } from "lucide-react";

// magica.com's 404, in light and dark.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-main-2 px-4 text-center">
      <p className="text-[96px] font-bold leading-none text-[#2b2b2b] sm:text-[128px] dark:text-text-primary" aria-hidden="true">
        404
      </p>
      <h1 className="mt-6 text-3xl font-semibold text-text-primary sm:text-4xl">Page not found</h1>
      <p className="mt-4 max-w-[512px] text-base text-text-secondary sm:text-lg">
        This page seems to have wandered into another galaxy. Return to Magica or open Chat to keep creating.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="flex h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <House className="size-4" aria-hidden="true" />
          Return to Magica
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href="/chat"
          className="flex h-11 items-center gap-2 rounded-[10px] border border-line-tertiary bg-surface-main px-4 text-sm font-medium text-text-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          Open Chat
        </Link>
      </div>
    </main>
  );
}
