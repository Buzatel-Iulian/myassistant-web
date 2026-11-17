import type { ModelKey, ResidentModel, ResidentStatus } from "@/lib/llm/engine";
import type { EngineFailure } from "@/lib/llm/errors";

// What the chat shows for its assistant's model, and what the load confirmation says. Pure, so the rules are tested
// without WebGPU: a model is never loaded without the user's confirmation, except a Reload of a model already resident.

/**
 * `ready`: the model is resident, the conversation is shown. `loading`: its load runs (the loader). `confirm`: it is
 * not resident, the user decides whether to load it. `error`: the last load failed.
 */
export type ModelView = "ready" | "loading" | "confirm" | "error";

export function modelView(status: ResidentStatus | null, failure: EngineFailure | null): ModelView {
  if (status === "ready") return "ready";
  if (status === "loading") return "loading";
  return failure ? "error" : "confirm";
}

/** Load next to the resident models, or unload them first ("Replace loaded models"). */
export type LoadMode = "alongside" | "replace";

export interface PlannedModel {
  key: ModelKey;
  modelId: string;
  contextWindowSize: number | null;
  /** WebLLM's estimate of its GPU memory; null when the catalogue does not say. */
  vramMB: number | null;
  status: ResidentStatus;
}

export interface LoadPlan {
  /** The estimate of the model to load; null when unknown. */
  vramMB: number | null;
  /** The other models in GPU memory (or loading), which stay there with "Load alongside". */
  resident: PlannedModel[];
  /** The sum of their estimates (the known ones). */
  residentMB: number;
  /** The sum after loading this one alongside (the known ones). */
  totalMB: number;
  /** Some estimate is missing, so the totals are a lower bound. */
  partial: boolean;
  /** "Replace loaded models" is offered only when another model is resident. */
  canReplace: boolean;
}

/** The confirmation's numbers for loading `modelId` as `key`, next to `residents`. */
export function planLoad(
  key: ModelKey,
  modelId: string,
  residents: readonly ResidentModel[],
  vramByModel: ReadonlyMap<string, number | null>
): LoadPlan {
  const vram = (id: string) => vramByModel.get(id) ?? null;
  const resident = residents
    .filter(model => model.key !== key)
    .map(model => ({ ...model, vramMB: vram(model.modelId) }));
  const residentMB = resident.reduce((sum, model) => sum + (model.vramMB ?? 0), 0);
  const vramMB = vram(modelId);
  return {
    vramMB,
    resident,
    residentMB,
    totalMB: residentMB + (vramMB ?? 0),
    partial: vramMB === null || resident.some(model => model.vramMB === null),
    canReplace: resident.length > 0
  };
}

/**
 * A load that failed for lack of GPU memory while other models are resident can be retried after unloading them
 * ("Unload other models and try again").
 */
export function canRetryAlone(failure: EngineFailure | null, key: ModelKey, residents: readonly ResidentModel[]) {
  return failure?.kind === "gpuMemory" && residents.some(model => model.key !== key);
}
