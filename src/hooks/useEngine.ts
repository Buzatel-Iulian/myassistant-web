import { useCallback, useEffect, useRef, useState } from "react";

import { isContextOverflow } from "@/lib/llm/context";
import { describeEngineError, type EngineAction, type EngineFailure } from "@/lib/llm/errors";
import {
  isModelLoaded,
  loadModel,
  stop as stopGeneration,
  streamChat,
  type ChatMessage,
  type GenerationParams,
  type LoadOptions,
  type LoadProgress
} from "@/lib/llm/engine";

export type EngineStatus = "idle" | "loading" | "ready" | "generating" | "error";

export interface SendRequest {
  messages: ChatMessage[];
  params: GenerationParams;
  /**
   * A shorter version of `messages`, sent once if the engine reports a context overflow before the first token
   * (text that tokenizes worse than the estimate of `lib/llm/context.ts`).
   */
  retryMessages?: ChatMessage[];
}

export interface UseEngine {
  status: EngineStatus;
  progress: LoadProgress;
  /** Why the last load or answer failed, in words the user can act on (never a stack trace). */
  error: EngineFailure | null;
  load: (modelId: string, options?: LoadOptions) => Promise<void>;
  /**
   * Streams the answer, calling `onText` with each new piece of text. Resolves when it ends, with the failure if it
   * failed. A context overflow is only returned (not put in `error`): the chat shows it as "message too long".
   */
  send: (request: SendRequest, onText: (text: string) => void) => Promise<EngineFailure | null>;
  stop: () => void;
}

const NO_PROGRESS: LoadProgress = { value: 0, text: "", stage: "starting" };

// A failure inside the worker crosses to the page as a plain string ("TypeError: Failed to fetch"), not an Error
// (QA-8-1). The raw value goes to the console so it can be diagnosed; the user gets what it means and what to do.
export function toFailure(error: unknown, action: EngineAction): EngineFailure {
  console.error(`Local model error (${action}):`, error);
  return describeEngineError(error, action, typeof navigator === "undefined" ? true : navigator.onLine);
}

// The bridge between components and lib/llm/engine.ts. The engine itself is one per app (module level); this hook
// only holds what the calling component shows: status, progress and the last error. The chat mounts one per
// assistant, so a result that arrives after a switch lands in the old (unmounted) hook and is never shown.
export function useEngine(): UseEngine {
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [progress, setProgress] = useState<LoadProgress>(NO_PROGRESS);
  const [error, setError] = useState<EngineFailure | null>(null);
  // Only the latest load of this hook may set its status: a retry or a settings change replaces an earlier load.
  const latestLoad = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (id: string, options?: LoadOptions) => {
    const loadId = ++latestLoad.current;
    const isCurrent = () => mounted.current && loadId === latestLoad.current;
    setError(null);
    // A model already loaded with these options is ready at once, without a loader flash.
    if (isModelLoaded(id, options)) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    setProgress(NO_PROGRESS);
    try {
      await loadModel(id, report => isCurrent() && setProgress(report), options);
      if (!isCurrent()) return;
      // A newer load (another assistant) replaced this one before it started: it was skipped, not loaded.
      if (!isModelLoaded(id, options)) return;
      setStatus("ready");
    } catch (loadError) {
      if (!isCurrent()) return;
      setError(toFailure(loadError, "load"));
      setStatus("error");
    }
  }, []);

  const send = useCallback(async ({ messages, params, retryMessages }: SendRequest, onText: (text: string) => void) => {
    setError(null);
    setStatus("generating");
    let received = false;
    const stream = async (history: ChatMessage[]) => {
      for await (const text of streamChat(history, params)) {
        received = true;
        onText(text);
      }
    };
    try {
      try {
        await stream(messages);
      } catch (sendError) {
        if (!retryMessages || received || !isContextOverflow(sendError)) throw sendError;
        console.warn("The prompt did not fit the context window; retrying with less history.", sendError);
        await stream(retryMessages);
      }
      return null;
    } catch (sendError) {
      // The model is still loaded, so the chat stays usable: the error is shown and the next message can be sent.
      const failure = toFailure(sendError, "answer");
      if (failure.kind !== "contextOverflow") setError(failure);
      return failure;
    } finally {
      // Only "generating" goes back to "ready": a load started meanwhile keeps its own status.
      setStatus(current => (current === "generating" ? "ready" : current));
    }
  }, []);

  const stop = useCallback(() => stopGeneration(), []);

  return { status, progress, error, load, send, stop };
}
