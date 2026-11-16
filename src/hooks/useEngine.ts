import { useCallback, useState } from "react";

import {
  getLoadedModelId,
  loadModel,
  stop as stopGeneration,
  streamChat,
  type ChatMessage,
  type LoadProgress
} from "@/lib/llm/engine";

export type EngineStatus = "idle" | "loading" | "ready" | "generating" | "error";

export interface UseEngine {
  status: EngineStatus;
  progress: LoadProgress;
  /** Why the last load or answer failed, in words the user can read. */
  error: string | null;
  load: (modelId: string) => Promise<void>;
  /** Streams the answer to `messages`, calling `onText` with each new piece of text. Resolves when it ends. */
  send: (messages: ChatMessage[], onText: (text: string) => void) => Promise<void>;
  stop: () => void;
}

const NO_PROGRESS: LoadProgress = { value: 0, text: "" };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong in the local model.";
}

// The bridge between components and lib/llm/engine.ts. The engine itself is one per app (module level); this hook
// only holds what the calling component shows: status, progress and the last error.
export function useEngine(): UseEngine {
  // A model loaded on an earlier visit of the page is ready at once, without a loader flash; load() switches to
  // "loading" straight away if it is asked for another model.
  const [status, setStatus] = useState<EngineStatus>(() => (getLoadedModelId() === null ? "idle" : "ready"));
  const [progress, setProgress] = useState<LoadProgress>(NO_PROGRESS);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setError(null);
    if (getLoadedModelId() !== id) {
      setStatus("loading");
      setProgress(NO_PROGRESS);
    }
    try {
      await loadModel(id, setProgress);
      setStatus("ready");
    } catch (loadError) {
      setError(errorMessage(loadError));
      setStatus("error");
    }
  }, []);

  const send = useCallback(async (messages: ChatMessage[], onText: (text: string) => void) => {
    setError(null);
    setStatus("generating");
    try {
      for await (const text of streamChat(messages)) onText(text);
    } catch (sendError) {
      // The model is still loaded, so the chat stays usable: the error is shown and the next message can be sent.
      setError(errorMessage(sendError));
    } finally {
      setStatus("ready");
    }
  }, []);

  const stop = useCallback(() => stopGeneration(), []);

  return { status, progress, error, load, send, stop };
}
