import { useApiQuery, type QueryState } from "@/hooks/useApiQuery";
import { configurationsChanged } from "@/lib/api/changes";
import { listConfigurations } from "@/lib/api/configurations";
import type { Configuration } from "@/lib/types";

const CHANGES = [configurationsChanged];

// The user's assistants, owned by the caller's state, never copied into a store: the API is the owner, and a second
// copy would drift from it. Fetched again after every write (lib/api/changes.ts), so the sidebar stays current.
export function useConfigurations(): QueryState<Configuration[]> {
  return useApiQuery("configurations", listConfigurations, CHANGES, "Could not load your assistants.");
}
