import { useCallback, useState, useSyncExternalStore } from "react";

import { modelView, type LoadMode, type ModelView } from "@/components/chat/loadPlan";
import { useResidentModels } from "@/hooks/useResidentModels";
import {
  getLoadProgress,
  loadModel,
  modelKey,
  reloadModel,
  subscribeLoadProgress,
  unloadAllModels,
  unloadModel,
  type LoadOptions,
  type LoadProgress,
  type ModelKey,
  type ResidentModel
} from "@/lib/llm/engine";
import { toFailure, type EngineFailure } from "@/lib/llm/errors";

export interface UseModel {
  key: ModelKey;
  view: ModelView;
  progress: LoadProgress;
  /** Why the last load of this key failed, in words the user can act on (never a stack trace). */
  error: EngineFailure | null;
  residents: readonly ResidentModel[];
  /** Loads the model after the user confirmed it; "replace" unloads every other model first. */
  load: (mode: LoadMode) => Promise<void>;
  /** Loads the resident model again from the cache, in a fresh engine (the header's Reload). */
  reload: () => Promise<void>;
  /** Frees its GPU memory; the chat then asks again before loading it. */
  unload: () => Promise<void>;
}

const NO_PROGRESS: LoadProgress = { value: 0, text: "", stage: "starting" };

// The bridge between a chat and the engine registry in lib/llm/engine.ts. The registry owns what is resident; this
// hook derives what the chat shows from it, so a chat opened again finds its model loaded (or still loading, with its
// progress) without loading anything. It never loads on its own: `load` is called by the confirmation.
export function useModel(modelId: string, options?: LoadOptions): UseModel {
  const key = modelKey(modelId, options);
  const residents = useResidentModels();
  const status = residents.find(model => model.key === key)?.status ?? null;
  const progress = useSyncExternalStore(subscribeLoadProgress, () => getLoadProgress(key)) ?? NO_PROGRESS;
  // Kept with its key: after an edit of the assistant (another model or window) the old failure does not apply.
  const [failure, setFailure] = useState<{ key: ModelKey; failure: EngineFailure } | null>(null);
  const error = failure?.key === key ? failure.failure : null;

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setFailure(null);
      try {
        await action();
      } catch (loadError) {
        setFailure({ key, failure: toFailure(loadError, "load") });
      }
    },
    [key]
  );

  const load = useCallback(
    (mode: LoadMode) =>
      run(async () => {
        if (mode === "replace") await unloadAllModels(key);
        await loadModel(modelId, options);
      }),
    // `options` is rebuilt by the caller on every render; `key` stands for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, key]
  );
  const reload = useCallback(() => run(() => reloadModel(key)), [run, key]);
  const unload = useCallback(() => run(() => unloadModel(key)), [run, key]);

  return { key, view: modelView(status, error), progress, error, residents, load, reload, unload };
}
