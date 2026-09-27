"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { listOrganizations } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { OrganizationRecord } from "@/types/project-type";

interface OrganizationContextValue {
  organizations: OrganizationRecord[];
  activeOrg: OrganizationRecord | null;
  activeOrgId: string | null;
  isLoading: boolean;
  setActiveOrgId: (orgId: string) => void;
  refresh: () => Promise<OrganizationRecord[]>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

const STORAGE_KEY = "codepulse.activeOrgId";
const CHANGE_EVENT = "codepulse:organization-changed";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function readStoredOrgId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrgId(orgId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    // Private browsing / storage disabled: the value still lives in the URL.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // getServerSnapshot returns null, so the first client render matches the
  // server and there is no hydration mismatch before storage is read.
  const storedOrgId = useSyncExternalStore(
    subscribe,
    readStoredOrgId,
    () => null,
  );

  const refresh = useCallback(async () => {
    try {
      const { organizations: loaded } = await listOrganizations();
      setOrganizations(loaded);
      return loaded;
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Could not load organizations",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    listOrganizations(controller.signal)
      .then(({ organizations: loaded }) => {
        setOrganizations(loaded);

        // Keep the URL and storage in sync when someone lands on a shared
        // ?org= link, and fall back to the first org otherwise.
        const requested = new URLSearchParams(window.location.search).get("org");
        const stored = readStoredOrgId();
        const valid = (id: string | null) =>
          !!id && loaded.some((org) => org.id === id);

        if (valid(requested)) {
          writeStoredOrgId(requested as string);
        } else if (!valid(stored) && loaded[0]) {
          writeStoredOrgId(loaded[0].id);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        toast.add({
          type: "error",
          description:
            error instanceof Error
              ? error.message
              : "Could not load organizations",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const activeOrgId = useMemo(() => {
    if (storedOrgId && organizations.some((org) => org.id === storedOrgId)) {
      return storedOrgId;
    }

    return organizations[0]?.id ?? null;
  }, [storedOrgId, organizations]);

  const setActiveOrgId = useCallback(
    (orgId: string) => {
      writeStoredOrgId(orgId);

      // Mirror into the query string so the view is shareable. This goes
      // through the router rather than history.replaceState so the Next
      // router cache, useSearchParams and scroll handling all stay in sync.
      const params = new URLSearchParams(window.location.search);
      if (params.get("org") === orgId) {
        return;
      }
      params.set("org", orgId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const activeOrg =
    organizations.find((org) => org.id === activeOrgId) ?? null;

  const value = useMemo(
    () => ({
      organizations,
      activeOrg,
      activeOrgId,
      isLoading,
      setActiveOrgId,
      refresh,
    }),
    [organizations, activeOrg, activeOrgId, isLoading, setActiveOrgId, refresh],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizations() {
  const context = useContext(OrganizationContext);

  if (!context) {
    throw new Error(
      "useOrganizations must be used inside OrganizationProvider",
    );
  }

  return context;
}
