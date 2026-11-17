import { useApiQuery, type QueryState } from "@/hooks/useApiQuery";
import { templatesChanged } from "@/lib/api/changes";
import { listTemplates } from "@/lib/api/templates";
import type { Template } from "@/lib/types";

const CHANGES = [templatesChanged];

// The user's templates, in the caller's state and fetched again after every template write.
export function useTemplates(): QueryState<Template[]> {
  return useApiQuery("templates", listTemplates, CHANGES, "Could not load your templates.");
}
