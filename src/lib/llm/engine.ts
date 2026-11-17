import type { ChatCompletionRequestBase, ChatOptions, InitProgressReport, WebWorkerMLCEngine } from "@mlc-ai/web-llm";

import { weightsBytes, weightsManifestUrl } from "@/lib/llm/cache";
import { loadStage, type LoadStage } from "@/lib/llm/progress";

// The app's own shapes, so that components never depend on WebLLM's types: this module is the only one that does.
export type ChatRole = "system" | "user" | "assistant";

/** One chat message in the OpenAI format that WebLLM's `chat.completions.create` accepts. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** The per-request sampling settings (`toChatOptions` in `settings.ts` maps an assistant's settings onto these). */
export type GenerationParams = Pick<
  ChatCompletionRequestBase,
  "temperature" | "top_p" | "max_tokens" | "frequency_penalty" | "presence_penalty"
>;

/**
 * What is fixed when a model is loaded (WebLLM's `ChatOptions`, the subset the app sets): the KV cache is allocated
 * for `context_window_size` tokens, so changing it means loading the model again.
 */
export type LoadOptions = Pick<ChatOptions, "context_window_size" | "sliding_window_size">;

/** Model loading progress: `value` from 0 to 1 within the current `stage`, and WebLLM's human-readable report text. */
export interface LoadProgress {
  value: number;
  text: string;
  stage: LoadStage;
}

export function toLoadProgress(report: InitProgressReport): LoadProgress {
  const value = Number.isFinite(report.progress) ? Math.min(1, Math.max(0, report.progress)) : 0;
  const text = report.text.trim();
  return { value, text, stage: loadStage(text) };
}

type WebLlm = typeof import("@mlc-ai/web-llm");
let webLlm: Promise<WebLlm> | null = null;

// WebLLM is a single ~6.5 MB module. It is imported on first use (a model load, or the model picker's list), so the
// rest of the app, and a browser without WebGPU that never opens the picker, does not download it.
function importWebLlm(): Promise<WebLlm> {
  webLlm ??= import("@mlc-ai/web-llm").catch((error: unknown) => {
    // A failed download of the module (offline) must not stick: the next call tries again.
    webLlm = null;
    throw error;
  });
  return webLlm;
}

// --- The resident models (Phase 12): one engine, with its own worker, per loaded model + load options. ---
//
// A model stays in GPU memory until the user unloads or replaces it, so going back to an assistant whose model is
// loaded is instant. Each loaded key has its own WebWorkerMLCEngine: one engine holds one model, and two engines never
// hold the same key (two assistants with the same model and context window share it). Unloading a key calls the
// engine's unload() and terminates its worker, which is what gives the GPU memory back.

/** What identifies a loaded model: the model and its load options (another context window is another copy). */
export type ModelKey = string;

export function modelKey(modelId: string, options?: LoadOptions): ModelKey {
  return `${modelId}|${options?.context_window_size ?? ""}|${options?.sliding_window_size ?? ""}`;
}

export type ResidentStatus = "loading" | "ready";

/** A model in GPU memory, or on its way there. */
export interface ResidentModel {
  key: ModelKey;
  modelId: string;
  /** The context window it was loaded with; null for WebLLM's default. */
  contextWindowSize: number | null;
  status: ResidentStatus;
}

interface ActiveStream {
  stopped: boolean;
}

interface Slot {
  key: ModelKey;
  modelId: string;
  options: LoadOptions | undefined;
  status: ResidentStatus;
  worker: Worker | null;
  engine: WebWorkerMLCEngine | null;
  /** The load (or reload) in progress or queued; shared by every caller that asks for this key meanwhile. */
  load: Promise<void> | null;
  /** True while WebLLM's reload() runs: an engine in the middle of a reload is terminated, never unload()ed. */
  reloading: boolean;
  /** Abandons the running reload() (the slot was unloaded during it), so the load queue moves on. */
  cancel: (() => void) | null;
  /** Unloaded (or failed): every step of a queued load checks it, and a stale load ends without loading. */
  removed: boolean;
  /** The latest progress report of its load; null when not loading or nothing reported yet. */
  progress: LoadProgress | null;
  // Each answer has its own stop flag, so a new answer cannot clear the stop asked for an older one still draining.
  streams: Set<ActiveStream>;
  // Answers on one engine run one after another: WebLLM's interruptGenerate() stops whichever is running, so Stop in
  // one chat must never land on another chat's answer that shares the engine.
  generationTurn: Promise<void>;
  // Settles when no answer is running on this engine: a reload or an unload waits for it, because unloading the model
  // under a running generation would fail inside the worker.
  idle: Promise<void>;
  endIdle: (() => void) | null;
}

const slots = new Map<ModelKey, Slot>();
// One load at a time for the whole app, even across engines: WebLLM's reload() is not safe to call twice on one
// engine, and two downloads plus two GPU uploads at once would make the memory peak of a load worse.
let loadQueue: Promise<void> = Promise.resolve();
// How long an unload waits for the worker to answer before it is terminated anyway (a worker whose GPU device was
// lost may never answer).
const UNLOAD_TIMEOUT_MS = 5000;

const residentListeners = new Set<() => void>();
const progressListeners = new Set<() => void>();
let residentSnapshot: readonly ResidentModel[] = [];

function publishResidents(): void {
  residentSnapshot = [...slots.values()].map(slot => ({
    key: slot.key,
    modelId: slot.modelId,
    contextWindowSize: slot.options?.context_window_size ?? null,
    status: slot.status
  }));
  for (const listener of residentListeners) listener();
}

/** The models loaded or loading, in the order they were asked for. A new array after every change. */
export function getResidentModels(): readonly ResidentModel[] {
  return residentSnapshot;
}

/** Calls `listener` after every change of the resident models (for `useSyncExternalStore`). */
export function subscribeResidentModels(listener: () => void): () => void {
  residentListeners.add(listener);
  return () => residentListeners.delete(listener);
}

/** The latest progress of the load of `key`, or null when it is not loading or has not reported yet. */
export function getLoadProgress(key: ModelKey): LoadProgress | null {
  const slot = slots.get(key);
  return slot?.status === "loading" ? slot.progress : null;
}

/**
 * Calls `listener` after every progress report of any load (for `useSyncExternalStore` with `getLoadProgress`). One
 * subscription for all keys, so a chat that subscribed before its load started (the confirmation) hears it too.
 */
export function subscribeLoadProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

function newSlot(modelId: string, options: LoadOptions | undefined): Slot {
  return {
    key: modelKey(modelId, options),
    modelId,
    options,
    status: "loading",
    worker: null,
    engine: null,
    load: null,
    reloading: false,
    cancel: null,
    removed: false,
    progress: null,
    streams: new Set(),
    generationTurn: Promise.resolve(),
    idle: Promise.resolve(),
    endIdle: null
  };
}

function forget(slot: Slot): void {
  slot.removed = true;
  if (slots.get(slot.key) === slot) slots.delete(slot.key);
  publishResidents();
}

// Frees the GPU memory of the slot's engine: unload() asks WebLLM to release the model, terminating the worker drops
// whatever is left (the WebGPU device dies with it). A reload cut short is only terminated: unload() would run under it.
async function dispose(slot: Slot, graceful: boolean): Promise<void> {
  const { engine, worker } = slot;
  slot.engine = null;
  slot.worker = null;
  if (engine && graceful) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => (timer = setTimeout(resolve, UNLOAD_TIMEOUT_MS)));
    await Promise.race([engine.unload().catch(() => undefined), timeout]);
    clearTimeout(timer);
  }
  worker?.terminate();
}

const CANCELLED = new Error("The load was cancelled.");

function queueLoad(slot: Slot): Promise<void> {
  slot.status = "loading";
  slot.progress = null;
  publishResidents();
  const run = loadQueue.then(async () => {
    try {
      // A load whose model was unloaded before its turn came is stale: it is skipped, nothing is loaded.
      if (slot.removed) return;
      // A reload of this engine waits for its running answers.
      await slot.idle;
      if (slot.removed) return;
      // Reloading a resident key: the old copy leaves GPU memory before the new one comes in.
      await dispose(slot, true);
      const { WebWorkerMLCEngine } = await importWebLlm();
      if (slot.removed) return;
      // Built without a model (instead of CreateWebWorkerMLCEngine) so that every load goes through this queue.
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      const engine = new WebWorkerMLCEngine(worker, {
        initProgressCallback: report => {
          if (slot.removed) return;
          slot.progress = toLoadProgress(report);
          for (const listener of progressListeners) listener();
        }
      });
      slot.worker = worker;
      slot.engine = engine;
      slot.reloading = true;
      const cancelled = new Promise<never>((_, reject) => (slot.cancel = () => reject(CANCELLED)));
      try {
        await Promise.race([engine.reload(slot.modelId, slot.options), cancelled]);
      } finally {
        slot.reloading = false;
        slot.cancel = null;
      }
      if (slot.removed) return;
      slot.status = "ready";
      slot.progress = null;
      publishResidents();
    } catch (error) {
      // Unloaded during the load: the user asked for it, it is not a failure.
      if (slot.removed) return;
      // A failed load leaves nothing resident (its worker may hold half a model), and the next attempt starts fresh.
      forget(slot);
      await dispose(slot, false);
      throw error;
    }
  });
  slot.load = run;
  const settled = () => {
    if (slot.load === run) slot.load = null;
  };
  // A failed load must not block the next one.
  loadQueue = run.then(settled, settled);
  return run;
}

/** Whether `modelId` is loaded with these options and ready to answer. */
export function isModelLoaded(modelId: string, options?: LoadOptions): boolean {
  return slots.get(modelKey(modelId, options))?.status === "ready";
}

/**
 * Loads `modelId` with `options` into an engine of its own, downloading it on first use (later loads come from the
 * browser cache), and keeps it resident next to the models already loaded. The same key already loaded resolves at
 * once; the same key loading shares that load. Loads run one at a time. Resolves without loading when the key was
 * unloaded before its load ended (check `isModelLoaded`); rejects when the load failed.
 */
export function loadModel(modelId: string, options?: LoadOptions): Promise<void> {
  const existing = slots.get(modelKey(modelId, options));
  if (existing) return existing.load ?? Promise.resolve();
  const slot = newSlot(modelId, options);
  slots.set(slot.key, slot);
  return queueLoad(slot);
}

/**
 * Loads a resident key again from the browser cache in a fresh engine: the old one is unloaded and its worker
 * terminated first. Waits for the answers running on it. A key that is not resident is not loaded (resolves).
 */
export function reloadModel(key: ModelKey): Promise<void> {
  const slot = slots.get(key);
  if (!slot) return Promise.resolve();
  return slot.load ?? queueLoad(slot);
}

/**
 * Frees the GPU memory of `key`: its answers are stopped, a queued load is dropped, a running load is abandoned, then
 * the engine is unloaded and its worker terminated. Resolves once that is done.
 */
export async function unloadModel(key: ModelKey): Promise<void> {
  const slot = slots.get(key);
  if (!slot) return;
  forget(slot);
  for (const stream of slot.streams) stream.stopped = true;
  slot.engine?.interruptGenerate();
  const wasReloading = slot.reloading;
  slot.cancel?.();
  await slot.idle;
  await dispose(slot, !wasReloading);
}

/** Unloads every resident model except `keep` (Replace loaded models, logout). */
export async function unloadAllModels(keep?: ModelKey): Promise<void> {
  await Promise.all([...slots.keys()].filter(key => key !== keep).map(key => unloadModel(key)));
}

function startGeneration(slot: Slot): ActiveStream {
  if (slot.streams.size === 0) slot.idle = new Promise(resolve => (slot.endIdle = resolve));
  const stream = { stopped: false };
  slot.streams.add(stream);
  return stream;
}

function endGeneration(slot: Slot, stream: ActiveStream): void {
  slot.streams.delete(stream);
  if (slot.streams.size === 0) {
    slot.endIdle?.();
    slot.endIdle = null;
  }
}

/**
 * Streams the answer of the model loaded as `key` to `messages`, one text delta at a time. `params` are the
 * per-request sampling settings. Aborting `signal` stops this answer only (the Stop button); the stream then ends
 * normally. Answers on the same engine run one after another.
 */
export async function* streamChat(
  key: ModelKey,
  messages: ChatMessage[],
  params: GenerationParams = {},
  signal?: AbortSignal
): AsyncGenerator<string> {
  const slot = slots.get(key);
  if (!slot || slot.status !== "ready" || !slot.engine) throw new Error("No model is loaded yet.");
  const stream = startGeneration(slot);
  const previous = slot.generationTurn;
  let release: () => void = () => undefined;
  slot.generationTurn = new Promise(resolve => (release = resolve));
  let running = false;
  const onAbort = () => {
    stream.stopped = true;
    if (running) slot.engine?.interruptGenerate();
  };
  signal?.addEventListener("abort", onAbort);
  try {
    await previous;
    const engine = slot.engine;
    if (stream.stopped || signal?.aborted || slot.removed || !engine) return;
    running = true;
    const chunks = await engine.chat.completions.create({ ...params, messages, stream: true });
    for await (const chunk of chunks) {
      if (stream.stopped) {
        // Stop can arrive before the worker starts generating, and WebLLM clears its interrupt flag when it starts.
        // Asking again stops it at the next token; the stream is still drained so the worker ends the request cleanly.
        engine.interruptGenerate();
        continue;
      }
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    release();
    endGeneration(slot, stream);
  }
}

// --- The model catalogue (the model picker, Phase 9). Here too, because only this module talks to WebLLM. ---

export type ModelKind = "llm" | "embedding" | "vlm";

/** One of WebLLM's prebuilt models, in the app's own shape. */
export interface PrebuiltModel {
  id: string;
  /** The GPU memory WebLLM estimates for it; null when the catalogue does not say. */
  vramRequiredMB: number | null;
  /** WebLLM's mark for models that run on low-memory devices such as laptops and phones. */
  lowResourceRequired: boolean;
  kind: ModelKind;
}

/** Every model of WebLLM's `prebuiltAppConfig.model_list`, in its order. Loads the WebLLM module, not the engine. */
export async function listPrebuiltModels(): Promise<PrebuiltModel[]> {
  const { prebuiltAppConfig, ModelType } = await importWebLlm();
  return prebuiltAppConfig.model_list.map(record => ({
    id: record.model_id,
    vramRequiredMB: typeof record.vram_required_MB === "number" ? record.vram_required_MB : null,
    lowResourceRequired: record.low_resource_required === true,
    // A record without a type is a chat model (WebLLM's default).
    kind: record.model_type === ModelType.embedding ? "embedding" : record.model_type === ModelType.VLM ? "vlm" : "llm"
  }));
}

/**
 * Whether the model's weights are already in the browser cache (Cache API), so loading it needs no download.
 * Only reads the cache: no engine, no worker, no GPU. False when the cache cannot be read.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await importWebLlm();
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

// --- The model cache (Settings → Model cache, Phase 11). ---

// WebLLM's Cache Storage bucket for weights and tokenizers (its default cache backend, the one the app uses).
const MODEL_CACHE = "webllm/model";

/** A model whose weights are in the browser cache. */
export interface CachedModel {
  id: string;
  /** The size of its weights, read from the cached manifest; null when it cannot be read. */
  sizeBytes: number | null;
  vramRequiredMB: number | null;
}

async function cachedWeightsBytes(modelUrl: string): Promise<number | null> {
  try {
    const response = await (await caches.open(MODEL_CACHE)).match(weightsManifestUrl(modelUrl));
    return response ? weightsBytes(await response.json()) : null;
  } catch {
    return null;
  }
}

/**
 * The models whose weights are in the browser cache, with their size. WebLLM has no size API: the size is the sum of
 * the shards listed in the model's cached manifest (`tensor-cache.json`), i.e. the weights; the tokenizer, config and
 * wasm (a few MB) are not counted.
 */
export async function listCachedModels(): Promise<CachedModel[]> {
  const { prebuiltAppConfig, hasModelInCache } = await importWebLlm();
  const records = prebuiltAppConfig.model_list;
  const flags = await Promise.all(records.map(record => hasModelInCache(record.model_id).catch(() => false)));
  const cached = records.filter((_, index) => flags[index]);
  return Promise.all(
    cached.map(async record => ({
      id: record.model_id,
      sizeBytes: await cachedWeightsBytes(record.model),
      vramRequiredMB: typeof record.vram_required_MB === "number" ? record.vram_required_MB : null
    }))
  );
}

/**
 * The size of the model's weights once its manifest is in the cache, which WebLLM fetches first: during the first
 * download it says how much is coming before WebLLM's first progress report (QA-11-A-4). Null when not known yet.
 */
export async function getModelWeightsSize(modelId: string): Promise<number | null> {
  try {
    const { prebuiltAppConfig } = await importWebLlm();
    const record = prebuiltAppConfig.model_list.find(item => item.model_id === modelId);
    return record ? await cachedWeightsBytes(record.model) : null;
  } catch {
    return null;
  }
}

/** Whether `modelId` is being loaded right now, with any options (its files may be downloading). */
export function isModelLoading(modelId: string): boolean {
  return [...slots.values()].some(slot => slot.modelId === modelId && slot.status === "loading");
}

/**
 * Deletes everything WebLLM cached for `modelId` (weights, tokenizer, config, wasm), so its next load downloads it
 * again. A model being loaded is refused: its download would write the files back half-way. A resident model stays in
 * GPU memory and keeps answering until it is unloaded; the deletion applies from its next load (Phase 12 decision).
 */
export async function deleteCachedModel(modelId: string): Promise<void> {
  if (isModelLoading(modelId)) throw new Error("This model is loading right now. Delete it once the load has ended.");
  const { prebuiltAppConfig, deleteModelAllInfoInCache } = await importWebLlm();
  await deleteModelAllInfoInCache(modelId);
  // WebLLM leaves the weights manifest behind (a few kB); without its shards it no longer counts as cached.
  const record = prebuiltAppConfig.model_list.find(item => item.model_id === modelId);
  if (record) await (await caches.open(MODEL_CACHE)).delete(weightsManifestUrl(record.model)).catch(() => false);
}
