import { configurationsChanged } from "@/lib/api/changes";
import { apiFetch } from "@/lib/api/client";
import type { Configuration, CreateConfigurationRequest, UpdateConfigurationRequest } from "@/lib/types";

// Typed wrappers over /api/configurations (docs: myassistant-api/docs/configuration-cases.md). Every write notifies
// `configurationsChanged`, which is what refreshes the sidebar's assistants list.

const path = (id: string) => `/configurations/${encodeURIComponent(id)}`;

// Favorites first, then by name ignoring letter case: the API sorts, the client shows the order as it comes.
export const listConfigurations = (signal?: AbortSignal) => apiFetch<Configuration[]>("/configurations", { signal });

export const getConfiguration = (id: string, signal?: AbortSignal) => apiFetch<Configuration>(path(id), { signal });

export async function createConfiguration(request: CreateConfigurationRequest): Promise<Configuration> {
  const configuration = await apiFetch<Configuration>("/configurations", { method: "POST", body: request });
  configurationsChanged.notify();
  return configuration;
}

/** 409 when `request.version` is no longer the stored one (changed in another tab). */
export async function updateConfiguration(id: string, request: UpdateConfigurationRequest): Promise<Configuration> {
  const configuration = await apiFetch<Configuration>(path(id), { method: "PUT", body: request });
  configurationsChanged.notify();
  return configuration;
}

export async function deleteConfiguration(id: string): Promise<void> {
  await apiFetch<void>(path(id), { method: "DELETE" });
  configurationsChanged.notify();
}

/** The copy: name "… (copy)", not a favorite, same model, settings, template and values. */
export async function duplicateConfiguration(id: string): Promise<Configuration> {
  const copy = await apiFetch<Configuration>(`${path(id)}/duplicate`, { method: "POST" });
  configurationsChanged.notify();
  return copy;
}
