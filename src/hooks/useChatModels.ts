import { useEffect, useState } from "react";

import { isModelCached } from "@/lib/llm/engine";
import { loadChatModels, type ChatModel } from "@/lib/llm/models";

export type ChatModelsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; models: ChatModel[]; cached: ReadonlySet<string> };

// The model catalogue for the picker, plus which models are already downloaded. The catalogue comes from the WebLLM
// module (lazy, through engine.ts); the cached set is read from the browser cache only, without loading anything.
export function useChatModels(): ChatModelsState {
  const [state, setState] = useState<ChatModelsState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    loadChatModels()
      .then(async models => {
        const flags = await Promise.all(models.map(model => isModelCached(model.id)));
        const cached = new Set(models.filter((_, index) => flags[index]).map(model => model.id));
        if (active) setState({ status: "ready", models, cached });
      })
      .catch((error: unknown) => {
        console.error("Could not load the model list:", error);
        if (active) setState({ status: "error", message: "Could not load the list of models. Check your connection." });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
