import { useSyncExternalStore } from "react";

import { getResidentModels, subscribeResidentModels, type ResidentModel } from "@/lib/llm/engine";

/** The models in GPU memory (or loading), from the engine registry: the chat header, the confirmation and Settings. */
export function useResidentModels(): readonly ResidentModel[] {
  return useSyncExternalStore(subscribeResidentModels, getResidentModels);
}
