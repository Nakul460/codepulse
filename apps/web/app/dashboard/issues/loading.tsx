import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function IssuesLoading() {
  return <SidebarInset id="main-content" aria-busy="true">
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 md:static md:z-auto md:border-b-0 md:bg-transparent">
      <SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-2 h-4" /><Skeleton className="h-5 w-20" />
    </header>
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6" role="status"><span className="sr-only">Loading issues…</span><Skeleton className="h-10 w-full" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
  </SidebarInset>;
}
