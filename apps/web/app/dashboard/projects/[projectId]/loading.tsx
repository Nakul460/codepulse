import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <SidebarInset id="main-content" aria-busy="true">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Skeleton className="h-4 w-44 max-w-full" />
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4 pt-2" role="status">
        <span className="sr-only">Loading project details…</span>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex min-h-72 flex-col gap-6 rounded-xl border p-5 lg:col-span-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="mt-auto grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-72 flex-col gap-4 rounded-xl border p-5">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-32 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-h-48 flex-col gap-4 rounded-xl border p-5">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-3/4 max-w-xl" />
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}
