import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { listConfigurations } from "@/lib/api/configurations";
import type { Configuration } from "@/lib/types";
import { useAuthStore } from "@/store/useAuthStore";

type ConfigurationsState =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; configurations: Configuration[] };

// The user's assistants, owned by this hook's caller (component state), never copied into a store: the API is the
// owner, and a second copy would drift from it.
export function useConfigurations(): ConfigurationsState {
  const token = useAuthStore(state => state.token);
  const [state, setState] = useState<ConfigurationsState & { token: string | null }>({ status: "loading", token });

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    listConfigurations(controller.signal)
      .then(configurations => setState({ status: "ready", configurations, token }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.detail : "Could not load your assistants.";
        setState({ status: "error", message, token });
      });
    return () => controller.abort();
  }, [token]);

  // A result fetched for another session (logout, then a new login in the same tab) is not this user's list.
  return state.token === token ? state : { status: "loading" };
}
