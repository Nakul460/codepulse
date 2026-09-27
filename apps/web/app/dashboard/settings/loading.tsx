import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <SidebarInset id="main-content" aria-busy="true">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Skeleton className="h-5 w-40" />
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4 pt-2" role="status">
        <span className="sr-only">Loading organization settings…</span>
        <div className="max-w-3xl rounded-xl border p-5">
          <div className="mb-6 flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="mb-2 h-4 w-16" />
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="mt-5 h-9 w-28" />
        </div>
        <div className="flex min-h-56 flex-col gap-4 rounded-xl border p-5">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 border-t pt-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}
