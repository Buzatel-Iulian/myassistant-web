import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { ChangeSignal } from "@/lib/api/changes";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/store/useAuthStore";

export type QueryState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

interface Fetched<T> {
  state: QueryState<T>;
  token: string | null;
  key: string;
}

/**
 * Fetches server data into the calling component's state (the API stays its only owner, nothing is copied into a
 * store). It fetches again when `key` changes, when the session changes, and when `changes` reports a write, so a
 * list refreshes after create, edit, delete or duplicate anywhere in the app. While it fetches again it keeps
 * showing the previous result instead of flashing a skeleton.
 */
export function useApiQuery<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  changes: readonly ChangeSignal[],
  failureMessage: string
): QueryState<T> {
  const token = useAuthStore(state => state.token);
  // `changes` is a module-level constant in every caller, so these keep their identity between renders.
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribes = changes.map(signal => signal.subscribe(listener));
      return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    },
    [changes]
  );
  // One number for all the signals: a write to any of them means "fetch again".
  const revision = useSyncExternalStore(subscribe, () => changes.reduce((sum, signal) => sum + signal.revision(), 0));
  const [fetched, setFetched] = useState<Fetched<T> | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    load(controller.signal)
      .then(data => setFetched({ state: { status: "ready", data }, token, key }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof ApiError)) console.error(failureMessage, error);
        const message = error instanceof ApiError ? error.detail : failureMessage;
        setFetched({ state: { status: "error", message }, token, key });
      });
    return () => controller.abort();
    // `load` is a new function on every render; `key` stands for what it fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, key, revision]);

  // A result fetched for another session (logout, then a new login in the same tab) or another item is not this one.
  if (!fetched || fetched.token !== token || fetched.key !== key) return { status: "loading" };
  return fetched.state;
}
