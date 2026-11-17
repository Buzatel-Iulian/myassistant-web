import type { ChatCompletionRequestBase, ChatOptions, InitProgressReport, WebWorkerMLCEngine } from "@mlc-ai/web-llm";

// The app's own shapes, so that components never depend on WebLLM's types: this module is the only one that does.
export type ChatRole = "system" | "user" | "assistant";

/** One chat message in the OpenAI format that WebLLM's `chat.completions.create` accepts. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** The per-request sampling settings. Phase 10 maps an assistant's settings onto these. */
export type GenerationParams = Pick<
  ChatCompletionRequestBase,
  "temperature" | "top_p" | "max_tokens" | "frequency_penalty" | "presence_penalty"
>;

/** Model loading progress: `value` from 0 to 1 and WebLLM's human-readable report text. */
export interface LoadProgress {
  value: number;
  text: string;
}

export type ProgressListener = (progress: LoadProgress) => void;

export function toLoadProgress(report: InitProgressReport): LoadProgress {
  const value = Number.isFinite(report.progress) ? Math.min(1, Math.max(0, report.progress)) : 0;
  return { value, text: report.text.trim() };
}

// One engine (and one worker) for the whole app: a second one would load a second copy of the weights into GPU memory.
let engine: WebWorkerMLCEngine | null = null;
let engineCreation: Promise<WebWorkerMLCEngine> | null = null;
let loadedModelId: string | null = null;
// Loads run one after another: WebLLM's reload() is not safe to call while another reload is still running.
let loadQueue: Promise<void> = Promise.resolve();
let pendingLoad: { modelId: string; promise: Promise<void> } | null = null;
// Only the latest caller of loadModel() receives progress; the engine keeps a single callback.
let progressListener: ProgressListener | null = null;
let stopRequested = false;

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

/**
 * Loads `modelId` into the engine, downloading it on first use (later loads come from the browser cache).
 * The same model already loaded resolves at once; the same model already loading shares that load; another model
 * waits for the current load to finish, then replaces it.
 */
export function loadModel(modelId: string, onProgress: ProgressListener, chatOpts?: ChatOptions): Promise<void> {
  progressListener = onProgress;
  if (pendingLoad?.modelId === modelId) return pendingLoad.promise;
  if (!pendingLoad && loadedModelId === modelId) return Promise.resolve();

  const promise = loadQueue.then(async () => {
    if (loadedModelId === modelId) return;
    loadedModelId = null;
    await (await getEngine()).reload(modelId, chatOpts);
    loadedModelId = modelId;
  });
  const settled = () => {
    if (pendingLoad?.promise === promise) pendingLoad = null;
  };
  pendingLoad = { modelId, promise };
  // A failed load must not block the next one, and a retry must start a fresh load.
  loadQueue = promise.then(settled, settled);
  return promise;
}

/** Streams the assistant's answer to `messages`, one text delta at a time. */
export async function* streamChat(messages: ChatMessage[], params: GenerationParams = {}): AsyncGenerator<string> {
  if (!engine || loadedModelId === null) throw new Error("No model is loaded yet.");
  stopRequested = false;
  const chunks = await engine.chat.completions.create({ ...params, messages, stream: true });
  for await (const chunk of chunks) {
    if (stopRequested) {
      // Stop can arrive before the worker starts generating, and WebLLM clears its interrupt flag when it starts.
      // Asking again stops it at the next token; the stream is still drained so the worker ends the request cleanly.
      engine.interruptGenerate();
      continue;
    }
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

/** Interrupts the answer being generated (the Stop button). The stream then ends normally. */
export function stop(): void {
  stopRequested = true;
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
