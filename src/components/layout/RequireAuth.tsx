import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/useHydrated";
import { ApiError } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/api/auth";
import { useAuthStore } from "@/store/useAuthStore";

// The app's shape in grey, as SkillForge shows it before its persisted state is read.
function AppSkeleton() {
  return (
    <div className="flex h-svh gap-4 p-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="hidden h-full w-64 rounded-lg md:block" />
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="flex-1 rounded-lg" />
      </div>
    </div>
  );
}

// Wraps every page that needs a login. It also loads the current user once per session (after login), which
// doubles as the first check that a token restored from sessionStorage is still accepted.
export function RequireAuth() {
  const hydrated = useHydrated();
  const token = useAuthStore(state => state.token);
  const hasUser = useAuthStore(state => state.user !== null);
  const location = useLocation();

  useEffect(() => {
    if (!token || hasUser) return;
    let current = true;
    getCurrentUser()
      .then(user => {
        if (current) useAuthStore.getState().setUser(user);
      })
      .catch((error: unknown) => {
        if (!current) return;
        // 401 already logged out in the client; 404 means the account behind a valid token is gone.
        if (error instanceof ApiError && error.status === 404) useAuthStore.getState().logout();
        else if (error instanceof ApiError && error.status !== 401) toast.error(error.detail);
      });
    return () => {
      current = false;
    };
  }, [token, hasUser]);

  if (!hydrated) return <AppSkeleton />;
  // `from` brings the user back to the page they asked for after logging in.
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
