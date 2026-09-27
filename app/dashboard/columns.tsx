"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { DataTableFeatures } from "./table-features";
import { ProjectRowActions } from "./project-row-actions";
import { cn } from "cn";
import { statusLabel } from "@/lib/project-status";
import { formatCurrency, formatShortDate } from "@/lib/format";
import type { ProjectRecord } from "@/types/project-type";

const columnHelper = createColumnHelper<DataTableFeatures, ProjectRecord>();

const STATUS_STYLES: Record<string, string> = {
  ongoing: "text-status-ongoing bg-status-ongoing/10",
  completed: "text-status-completed bg-status-completed/10",
  upcoming: "text-status-upcoming bg-status-upcoming/10",
  "on hold": "text-status-hold bg-status-hold/10",
  "behind schedule": "text-status-late bg-status-late/10",
};

export interface ProjectRowActionHandlers {
  onChanged: (project: ProjectRecord) => void;
  onDeleted: (projectId: string) => void;
}

export function getColumns({
  onChanged,
  onDeleted,
}: ProjectRowActionHandlers) {
  return columnHelper.columns([
    columnHelper.accessor("projectName", {
      header: "Project",
      cell: ({ row }) => {
        const { projectName, description, archivedAt } = row.original;

        return (
          <div className="flex min-w-0 max-w-[22rem] flex-col gap-0.5">
            <Link
              href={`/dashboard/projects/${row.original.id}`}
              className={cn(
                "truncate font-medium hover:underline underline-offset-4 focus-visible:underline",
                archivedAt ? "text-muted-foreground" : "text-foreground",
              )}
              title={projectName}
            >
              {projectName || "Untitled project"}
            </Link>
            {description && (
              <span
                className="truncate text-xs text-muted-foreground"
                title={description}
              >
                {description}
              </span>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ getValue, row }) => {
        const status = getValue();
        const style = STATUS_STYLES[status];

        return (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                style ?? "text-muted-foreground bg-muted",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {statusLabel(status)}
            </span>
            {row.original.archivedAt && (
              <span className="text-xs text-muted-foreground">
                    Archived
                  </span>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor("startDate", {
      header: "Start",
      cell: ({ getValue }) => {
        const formatted = formatShortDate(getValue());
        return formatted ? (
          <span className="whitespace-nowrap tabular-nums">{formatted}</span>
        ) : (
          <span className="text-muted-foreground">Not set</span>
        );
      },
    }),

    columnHelper.accessor("endDate", {
      header: "End",
      cell: ({ getValue }) => {
        const formatted = formatShortDate(getValue());
        return formatted ? (
          <span className="whitespace-nowrap tabular-nums">{formatted}</span>
        ) : (
          <span className="text-muted-foreground">Not set</span>
        );
      },
    }),

    columnHelper.accessor("budget", {
      header: "Budget",
      cell: ({ getValue }) => {
        const budget = getValue();
        return (
          <span className="block text-right font-medium tabular-nums">
            {budget == null ? (
              <span className="font-normal text-muted-foreground">Not set</span>
            ) : (
              formatCurrency(budget)
            )}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ProjectRowActions
            project={row.original}
            onChanged={onChanged}
            onDeleted={onDeleted}
          />
        </div>
      ),
    }),
  ]);
}
