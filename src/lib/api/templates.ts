import { configurationsChanged, templatesChanged } from "@/lib/api/changes";
import { apiFetch } from "@/lib/api/client";
import type { CreateTemplateRequest, Template, UpdateTemplateRequest } from "@/lib/types";

// Typed wrappers over /api/templates (docs: myassistant-api/docs/template-cases.md). Writes notify the lists.

/** The user's templates, sorted by name ignoring letter case (the API sorts). */
export const listTemplates = (signal?: AbortSignal) => apiFetch<Template[]>("/templates", { signal });

export const getTemplate = (id: string, signal?: AbortSignal) =>
  apiFetch<Template>(`/templates/${encodeURIComponent(id)}`, { signal });

export async function createTemplate(request: CreateTemplateRequest): Promise<Template> {
  const template = await apiFetch<Template>("/templates", { method: "POST", body: request });
  templatesChanged.notify();
  return template;
}

/** 409 when `request.version` is no longer the stored one (changed in another tab). */
export async function updateTemplate(id: string, request: UpdateTemplateRequest): Promise<Template> {
  const template = await apiFetch<Template>(`/templates/${encodeURIComponent(id)}`, { method: "PUT", body: request });
  templatesChanged.notify();
  // Every configuration embeds its template, so the assistants' copies are outdated too.
  configurationsChanged.notify();
  return template;
}

/** 409 with `configurations` (their names) when assistants still use the template. */
export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch<void>(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  templatesChanged.notify();
}
