import type { Configuration } from "@/lib/types";

/**
 * Which assistant `/chat` (no id: the app's start page and the sidebar's "New chat") opens: the last one used if it
 * is still one of the user's assistants, else the first favorite, else the first one. Null when there is none.
 * Checking against the user's own list means an id left by another user of this browser is never opened.
 */
export function pickAssistant<T extends Pick<Configuration, "id" | "favorite">>(
  assistants: readonly T[],
  lastUsedId: string | null
): T | null {
  return (
    assistants.find(assistant => assistant.id === lastUsedId) ??
    assistants.find(assistant => assistant.favorite) ??
    assistants[0] ??
    null
  );
}
