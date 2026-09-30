import { Skeleton } from "@/components/ui/skeleton";

const WIDTHS = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"];

export function SidebarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks" className="space-y-0.5">
      {WIDTHS.map((width) => (
        <div key={width} className="flex h-[34px] items-center px-2">
          <Skeleton className={`h-3.5 rounded ${width}`} />
        </div>
      ))}
    </div>
  );
}
