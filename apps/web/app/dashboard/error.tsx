"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset } from "@/components/ui/sidebar";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] page failed", error.digest ?? "no error digest");
  }, [error]);

  return (
    <SidebarInset id="main-content">
      <div className="grid flex-1 place-items-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TriangleAlertIcon aria-hidden="true" />
            </div>
            <CardTitle>We couldn’t open this page</CardTitle>
            <CardDescription>
              Something interrupted the dashboard. Try loading it again, or
              return to your projects.
            </CardDescription>
          </CardHeader>
          {error.digest && (
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            </CardContent>
          )}
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" render={<Link href="/dashboard" />}>
              Back to projects
            </Button>
            <Button onClick={retry}>Try again</Button>
          </CardFooter>
        </Card>
      </div>
    </SidebarInset>
  );
}
