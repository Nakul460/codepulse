import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <SidebarInset id="main-content" aria-busy="true">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:bg-transparent md:backdrop-blur-none">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Skeleton className="h-4 w-20" />
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6" role="status">
        <span className="sr-only">Loading account settings…</span>
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex min-h-40 flex-col gap-4 rounded-xl border p-5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64 max-w-full" />
              <div className="mt-auto flex items-center justify-between gap-4">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}
