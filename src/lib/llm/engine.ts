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

export type ProgressListener = (progress: LoadProgress) => void;

export function toLoadProgress(report: InitProgressReport): LoadProgress {
  const value = Number.isFinite(report.progress) ? Math.min(1, Math.max(0, report.progress)) : 0;
  const text = report.text.trim();
  return { value, text, stage: loadStage(text) };
}

// One engine (and one worker) for the whole app: a second one would load a second copy of the weights into GPU memory.
let engine: WebWorkerMLCEngine | null = null;
let engineCreation: Promise<WebWorkerMLCEngine> | null = null;
let loadedModelId: string | null = null;
// The model and the load options it was loaded with: the same model with another context window is another load.
let loadedKey: string | null = null;
// Loads run one after another: WebLLM's reload() is not safe to call while another reload is still running.
let loadQueue: Promise<void> = Promise.resolve();
let pendingLoad: { key: string; promise: Promise<void> } | null = null;
// The key of the latest loadModel() call. A queued load that a newer call replaced before it started is skipped:
// a user who clicks through three assistants waits for one load, not three.
let wantedKey: string | null = null;
// Only the latest caller of loadModel() receives progress; the engine keeps a single callback.
let progressListener: ProgressListener | null = null;

// Each answer being streamed has its own stop flag, so a new answer (another assistant's chat) cannot clear the stop
// asked for an older one that is still draining. `generating` settles when no answer is running: a reload waits for
// it, because unloading the model under a running generation would fail inside the worker.
interface ActiveStream {
  stopped: boolean;
}
const activeStreams = new Set<ActiveStream>();
let generationsDone: Promise<void> = Promise.resolve();
let endGenerations: (() => void) | null = null;

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

function getEngine(): Promise<WebWorkerMLCEngine> {
  engineCreation ??= importWebLlm().then(
    ({ WebWorkerMLCEngine }) => {
      // Built without a model (instead of CreateWebWorkerMLCEngine) so that every load, including the first, goes
      // through the same queue below.
      engine = new WebWorkerMLCEngine(new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }), {
        initProgressCallback: report => progressListener?.(toLoadProgress(report))
      });
      return engine;
    },
    (error: unknown) => {
      engineCreation = null;
      throw error;
    }
  );
  return engineCreation;
}

export function getLoadedModelId(): string | null {
  return loadedModelId;
}

function loadKey(modelId: string, options?: LoadOptions): string {
  return `${modelId}|${options?.context_window_size ?? ""}|${options?.sliding_window_size ?? ""}`;
}

/** Whether `modelId` is loaded with these options, so a chat can start without showing the loader. */
export function isModelLoaded(modelId: string, options?: LoadOptions): boolean {
  return !pendingLoad && loadedKey === loadKey(modelId, options);
}

/**
 * Loads `modelId` with `options` into the engine, downloading it on first use (later loads come from the browser
 * cache). The same model with the same options already loaded resolves at once; the same load already running is
 * shared; anything else waits for the current load and for any running answer to end, then replaces the model.
 * The same model with another context window is loaded again (from the cache): WebLLM sizes its KV cache at load.
 */
export function loadModel(modelId: string, onProgress: ProgressListener, options?: LoadOptions): Promise<void> {
  const key = loadKey(modelId, options);
  progressListener = onProgress;
  wantedKey = key;
  if (pendingLoad?.key === key) return pendingLoad.promise;
  if (!pendingLoad && loadedKey === key) return Promise.resolve();

  const promise = loadQueue.then(async () => {
    if (loadedKey === key || wantedKey !== key) return;
    await generationsDone;
    loadedModelId = null;
    loadedKey = null;
    await (await getEngine()).reload(modelId, options);
    loadedModelId = modelId;
    loadedKey = key;
  });
  const settled = () => {
    if (pendingLoad?.promise === promise) pendingLoad = null;
  };
  pendingLoad = { key, promise };
  // A failed load must not block the next one, and a retry must start a fresh load.
  loadQueue = promise.then(settled, settled);
  return promise;
}

function startGeneration(): ActiveStream {
  if (activeStreams.size === 0) generationsDone = new Promise(resolve => (endGenerations = resolve));
  const stream = { stopped: false };
  activeStreams.add(stream);
  return stream;
}

function endGeneration(stream: ActiveStream): void {
  activeStreams.delete(stream);
  if (activeStreams.size === 0) {
    endGenerations?.();
    endGenerations = null;
  }
}

/**
 * Streams the assistant's answer to `messages`, one text delta at a time. `params` are the per-request sampling
 * settings (temperature, top-p, max tokens, penalties).
 */
export async function* streamChat(messages: ChatMessage[], params: GenerationParams = {}): AsyncGenerator<string> {
  if (!engine || loadedModelId === null) throw new Error("No model is loaded yet.");
  const stream = startGeneration();
  try {
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
    endGeneration(stream);
  }
}

/** Interrupts the answer being generated (the Stop button). The stream then ends normally. */
export function stop(): void {
  for (const stream of activeStreams) stream.stopped = true;
  engine?.interruptGenerate();
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

/** Whether `modelId` is being loaded right now (its files may be downloading). */
export function isModelLoading(modelId: string): boolean {
  return pendingLoad !== null && pendingLoad.key.startsWith(`${modelId}|`);
}

/**
 * Deletes everything WebLLM cached for `modelId` (weights, tokenizer, config, wasm), so its next load downloads it
 * again. A model being loaded is refused: its download would write the files back half-way. A model already loaded
 * stays in GPU memory for the open chat; the deletion applies from its next load.
 */
export async function deleteCachedModel(modelId: string): Promise<void> {
  if (isModelLoading(modelId)) throw new Error("This model is loading right now. Delete it once the load has ended.");
  const { prebuiltAppConfig, deleteModelAllInfoInCache } = await importWebLlm();
  await deleteModelAllInfoInCache(modelId);
  // WebLLM leaves the weights manifest behind (a few kB); without its shards it no longer counts as cached.
  const record = prebuiltAppConfig.model_list.find(item => item.model_id === modelId);
  if (record) await (await caches.open(MODEL_CACHE)).delete(weightsManifestUrl(record.model)).catch(() => false);
}
