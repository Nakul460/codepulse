"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleCheckIcon,
  FilePlusIcon,
  InfoIcon,
  PenLineIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityAction, ProjectActivityRecord } from "@/types/project-type";

const FIELD_LABELS: Record<string, string> = {
  projectName: "name",
  description: "description",
  status: "status",
  startDate: "start date",
  endDate: "end date",
  budget: "budget",
};

const ACTION_META: Record<
  ActivityAction,
  { icon: typeof InfoIcon; tone: string; describe: (a: ProjectActivityRecord) => string }
> = {
  "project.created": {
    icon: FilePlusIcon,
    tone: "text-status-upcoming bg-status-upcoming/10",
    describe: () => "created this project",
  },
  "project.updated": {
    icon: PenLineIcon,
    tone: "text-status-ongoing bg-status-ongoing/10",
    describe: (a) => {
      if (a.changes.length === 0) {
        return "updated this project";
      }
      const names = a.changes.map((c) => FIELD_LABELS[c] ?? c);
      const list =
        names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      return `updated ${list}`;
    },
  },
  "project.archived": {
    icon: ArchiveIcon,
    tone: "text-status-hold bg-status-hold/10",
    describe: () => "archived this project",
  },
  "project.restored": {
    icon: ArchiveRestoreIcon,
    tone: "text-status-ongoing bg-status-ongoing/10",
    describe: () => "restored this project",
  },
  "project.deleted": {
    icon: Trash2Icon,
    tone: "text-status-late bg-status-late/10",
    describe: () => "deleted this project",
  },
  "member.added": {
    icon: UserPlusIcon,
    tone: "text-status-upcoming bg-status-upcoming/10",
    describe: (a) => `added ${a.changes[0] ?? "a member"}`,
  },
  "member.removed": {
    icon: UserMinusIcon,
    tone: "text-status-late bg-status-late/10",
    describe: (a) => `removed ${a.changes[0] ?? "a member"}`,
  },
  "member.role_changed": {
    icon: CircleCheckIcon,
    tone: "text-status-completed bg-status-completed/10",
    describe: (a) => {
      const from = String(a.metadata?.from ?? "?");
      const to = String(a.metadata?.to ?? "?");
      return `changed ${a.changes[0] ?? "a member"} from ${from} to ${to}`;
    },
  },
};

interface ActivityFeedProps {
  activity: ProjectActivityRecord[];
  isLoading: boolean;
}

export function ActivityFeed({ activity, isLoading }: ActivityFeedProps) {
  // Null during SSR and the first paint, so the server and client agree, then
  // pinned and refreshed on an interval so "2 minutes ago" does not go stale on
  // an open tab. Primed on the next frame rather than synchronously to avoid a
  // cascading render.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const frame = requestAnimationFrame(update);
    const timer = setInterval(update, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {activity.map((entry, index) => {
        const meta = ACTION_META[entry.action];
        const Icon = meta.icon;

        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  meta.tone,
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              {index < activity.length - 1 && (
                <span className="w-px flex-1 bg-border" />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-5">
              <p className="text-sm break-words">
                <span className="font-medium">
                  {entry.actorName || "Someone"}
                </span>{" "}
                {meta.describe(entry)}
              </p>
              <time
                dateTime={entry.createdAt}
                className="text-xs text-muted-foreground"
                title={formatDateTime(entry.createdAt)}
              >
                {now === null
                  ? formatDateTime(entry.createdAt)
                  : formatRelativeTime(entry.createdAt, now)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
