import { apiFetch } from "@/lib/api/client";
import type { Configuration } from "@/lib/types";

// Favorites first, then by name ignoring letter case: the API sorts, the client shows the order as it comes.
export const listConfigurations = (signal?: AbortSignal) => apiFetch<Configuration[]>("/configurations", { signal });
