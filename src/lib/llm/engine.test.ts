import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InitProgressReport } from "@mlc-ai/web-llm";

interface FakeEngine {
  id: number;
  worker: FakeWorker;
  reload: ReturnType<typeof vi.fn<(modelId: string, chatOpts?: unknown) => Promise<void>>>;
  unload: ReturnType<typeof vi.fn<() => Promise<void>>>;
  interruptGenerate: ReturnType<typeof vi.fn<() => void>>;
  progress: (report: { progress: number; timeElapsed: number; text: string }) => void;
}

interface FakeWorker {
  url: string;
  options: WorkerOptions;
  terminated: boolean;
}

// A fake WebLLM: the real one needs WebGPU and a model download. It records every engine the module creates, and
// the behaviour of each engine's reload/unload/create is set per test through `fake`.
const fake = vi.hoisted(() => ({
  reload: null as unknown as ReturnType<typeof vi.fn<(modelId: string, chatOpts?: unknown) => Promise<void>>>,
  unload: null as unknown as ReturnType<typeof vi.fn<() => Promise<void>>>,
  create: null as unknown as ReturnType<
    typeof vi.fn<(request: { messages: unknown[]; stream: boolean }) => Promise<AsyncIterable<unknown>>>
  >,
  engines: [] as FakeEngine[],
  hasModelInCache: null as unknown as ReturnType<typeof vi.fn<(modelId: string) => Promise<boolean>>>,
  deleteModelAllInfoInCache: null as unknown as ReturnType<typeof vi.fn<(modelId: string) => Promise<void>>>
}));

vi.mock("@mlc-ai/web-llm", () => ({
  ModelType: { LLM: 0, embedding: 1, VLM: 2 },
  prebuiltAppConfig: {
    model_list: [
      {
        model_id: "Chat-A-MLC",
        model: "https://huggingface.co/mlc-ai/Chat-A-MLC",
        vram_required_MB: 944.62,
        low_resource_required: true
      },
      {
        model_id: "Chat-B-MLC",
        model: "https://huggingface.co/mlc-ai/Chat-B-MLC",
        vram_required_MB: 5001,
        low_resource_required: false,
        model_type: 0
      },
      { model_id: "Embed-MLC", vram_required_MB: 300, model_type: 1 },
      { model_id: "Vision-MLC", model_type: 2 }
    ]
  },
  hasModelInCache: (id: string) => fake.hasModelInCache(id),
  deleteModelAllInfoInCache: (id: string) => fake.deleteModelAllInfoInCache(id),
  WebWorkerMLCEngine: class {
    chat = { completions: { create: (request: { messages: unknown[]; stream: boolean }) => fake.create(request) } };
    record: FakeEngine;
    constructor(worker: FakeWorker, config: { initProgressCallback: FakeEngine["progress"] }) {
      this.record = {
        id: fake.engines.length + 1,
        worker,
        reload: vi.fn((modelId: string, chatOpts?: unknown) => fake.reload(modelId, chatOpts)),
        unload: vi.fn(() => fake.unload()),
        interruptGenerate: vi.fn(),
        progress: config.initProgressCallback
      };
      fake.engines.push(this.record);
    }
    reload(modelId: string, chatOpts?: unknown) {
      return this.record.reload(modelId, chatOpts);
    }
    unload() {
      return this.record.unload();
    }
    interruptGenerate() {
      this.record.interruptGenerate();
    }
  }
}));

type EngineModule = typeof import("@/lib/llm/engine");

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function chunk(content: string | undefined) {
  return { choices: [{ delta: content === undefined ? {} : { content } }] };
}

async function* chunks(...contents: (string | undefined)[]) {
  for (const content of contents) yield chunk(content);
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const text of stream) out.push(text);
  return out;
}

// An answer that yields `first`, then waits for `release` before yielding `rest`.
function heldAnswer(release: Promise<void>, first: string, ...rest: string[]) {
  return async () =>
    (async function* () {
      yield chunk(first);
      await release;
      for (const text of rest) yield chunk(text);
    })();
}

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const reloadedModels = () => fake.engines.flatMap(engine => engine.reload.mock.calls.map(call => call[0]));

describe("engine", () => {
  let engine: EngineModule;
  const small = { context_window_size: 1024, sliding_window_size: -1 };
  const large = { context_window_size: 4096, sliding_window_size: -1 };
  const messages = [
    { role: "system" as const, content: "You are a helpful assistant." },
    { role: "user" as const, content: "Say hi" }
  ];

  beforeEach(async () => {
    // The module keeps the registry of engines; a fresh copy per test keeps the tests independent.
    vi.resetModules();
    fake.reload = vi.fn().mockResolvedValue(undefined);
    fake.unload = vi.fn().mockResolvedValue(undefined);
    fake.create = vi.fn();
    fake.hasModelInCache = vi.fn();
    fake.deleteModelAllInfoInCache = vi.fn();
    fake.engines.length = 0;
    vi.stubGlobal(
      "Worker",
      class {
        url: string;
        options: WorkerOptions;
        terminated = false;
        constructor(url: URL, options: WorkerOptions) {
          this.url = String(url);
          this.options = options;
        }
        terminate() {
          this.terminated = true;
        }
      }
    );
    engine = await import("@/lib/llm/engine");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("toLoadProgress", () => {
    const report = (progress: number, text = "x"): InitProgressReport => ({ progress, text, timeElapsed: 0 });

    it("keeps the value between 0 and 1 and trims the text", () => {
      expect(engine.toLoadProgress(report(0.42, "  Fetching param cache[3/10]: 42%  "))).toEqual({
        value: 0.42,
        text: "Fetching param cache[3/10]: 42%",
        stage: "downloading"
      });
      expect(engine.toLoadProgress(report(1.3)).value).toBe(1);
      expect(engine.toLoadProgress(report(-0.1)).value).toBe(0);
      expect(engine.toLoadProgress(report(Number.NaN)).value).toBe(0);
    });
  });

  describe("registry of resident models (Phase 12)", () => {
    it("loads a model into its own engine and worker, and reports its progress", async () => {
      const progress = vi.fn();
      engine.subscribeLoadProgress(progress);
      const key = engine.modelKey("model-a", small);
      fake.reload.mockImplementation(async () => {
        fake.engines[0]?.progress({ progress: 0.5, timeElapsed: 1, text: "Fetching param cache: 50%" });
        expect(engine.getLoadProgress(key)).toEqual({
          value: 0.5,
          text: "Fetching param cache: 50%",
          stage: "downloading"
        });
      });

      const loading = engine.loadModel("model-a", small);
      expect(engine.getResidentModels()).toEqual([
        { key, modelId: "model-a", contextWindowSize: 1024, status: "loading" }
      ]);
      await loading;

      expect(fake.engines).toHaveLength(1);
      expect(fake.engines[0]?.worker.url).toMatch(/worker\.ts$/);
      expect(fake.engines[0]?.worker.options).toEqual({ type: "module" });
      expect(fake.engines[0]?.reload).toHaveBeenCalledWith("model-a", small);
      expect(progress).toHaveBeenCalled();
      expect(engine.isModelLoaded("model-a", small)).toBe(true);
      expect(engine.getLoadProgress(key)).toBeNull();
      expect(engine.getResidentModels()[0]?.status).toBe("ready");
    });

    it("keeps a model resident when another one is loaded, each in its own engine", async () => {
      await engine.loadModel("model-a", small);
      await engine.loadModel("model-b", small);

      expect(fake.engines).toHaveLength(2);
      expect(fake.engines.map(e => e.worker.terminated)).toEqual([false, false]);
      expect(engine.isModelLoaded("model-a", small)).toBe(true);
      expect(engine.isModelLoaded("model-b", small)).toBe(true);
      expect(engine.getResidentModels().map(model => model.modelId)).toEqual(["model-a", "model-b"]);
    });

    it("does not load a resident key again: going back to it is instant", async () => {
      await engine.loadModel("model-a", small);
      await engine.loadModel("model-b", small);
      await engine.loadModel("model-a", { ...small });

      expect(reloadedModels()).toEqual(["model-a", "model-b"]);
    });

    it("treats the same model with another context window as another key (WebLLM sizes the KV cache at load)", async () => {
      await engine.loadModel("model-a", small);
      await engine.loadModel("model-a", large);

      expect(fake.engines).toHaveLength(2);
      expect(engine.isModelLoaded("model-a", small)).toBe(true);
      expect(engine.isModelLoaded("model-a", large)).toBe(true);
    });

    it("shares a load already in progress for the same key", async () => {
      const load = deferred();
      fake.reload.mockReturnValue(load.promise);

      const first = engine.loadModel("model-a", small);
      const second = engine.loadModel("model-a", small);
      load.resolve();
      await Promise.all([first, second]);

      expect(second).toBe(first);
      expect(fake.engines).toHaveLength(1);
      expect(fake.engines[0]?.reload).toHaveBeenCalledTimes(1);
    });

    it("runs loads one at a time, also across engines", async () => {
      const loadA = deferred();
      fake.reload.mockReturnValueOnce(loadA.promise);

      const first = engine.loadModel("model-a");
      await vi.waitFor(() => expect(fake.engines).toHaveLength(1));
      const second = engine.loadModel("model-b");
      await tick();
      expect(fake.engines).toHaveLength(1);

      loadA.resolve();
      await Promise.all([first, second]);
      expect(reloadedModels()).toEqual(["model-a", "model-b"]);
    });

    it("forgets a failed load, frees its worker, and does not block the next load", async () => {
      fake.reload.mockRejectedValueOnce(new Error("Network error"));

      await expect(engine.loadModel("model-a")).rejects.toThrow("Network error");
      expect(engine.getResidentModels()).toEqual([]);
      expect(fake.engines[0]?.worker.terminated).toBe(true);

      await engine.loadModel("model-a");
      expect(engine.isModelLoaded("model-a")).toBe(true);
      expect(fake.engines).toHaveLength(2);
    });

    it("skips a queued load whose model was unloaded before its turn", async () => {
      const loadA = deferred();
      fake.reload.mockReturnValueOnce(loadA.promise);

      const a = engine.loadModel("model-a");
      await vi.waitFor(() => expect(fake.engines).toHaveLength(1));
      const b = engine.loadModel("model-b");
      await engine.unloadModel(engine.modelKey("model-b"));
      loadA.resolve();
      await Promise.all([a, b]);

      expect(reloadedModels()).toEqual(["model-a"]);
      expect(engine.isModelLoaded("model-b")).toBe(false);
    });

    it("unload frees the GPU memory: unload() then the worker is terminated", async () => {
      await engine.loadModel("model-a");
      const key = engine.modelKey("model-a");
      await engine.unloadModel(key);

      const [record] = fake.engines;
      expect(record?.unload).toHaveBeenCalledTimes(1);
      expect(record?.worker.terminated).toBe(true);
      expect(engine.getResidentModels()).toEqual([]);
      expect(engine.isModelLoaded("model-a")).toBe(false);
    });

    it("unload during a load abandons it, terminates the worker and lets the queue go on", async () => {
      fake.reload.mockReturnValueOnce(new Promise(() => undefined));
      const a = engine.loadModel("model-a");
      await vi.waitFor(() => expect(fake.engines).toHaveLength(1));
      const b = engine.loadModel("model-b");

      await engine.unloadModel(engine.modelKey("model-a"));
      await Promise.all([a, b]);

      expect(fake.engines[0]?.worker.terminated).toBe(true);
      // unload() would run under the abandoned reload inside the worker.
      expect(fake.engines[0]?.unload).not.toHaveBeenCalled();
      expect(engine.isModelLoaded("model-a")).toBe(false);
      expect(engine.isModelLoaded("model-b")).toBe(true);
    });

    it("terminates the worker even when unload() never answers", async () => {
      vi.useFakeTimers();
      try {
        await engine.loadModel("model-a");
        fake.unload.mockReturnValue(new Promise(() => undefined));
        const unloading = engine.unloadModel(engine.modelKey("model-a"));
        await vi.advanceTimersByTimeAsync(6000);
        await unloading;
        expect(fake.engines[0]?.worker.terminated).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("unloadAllModels keeps only the given key (Replace loaded models)", async () => {
      await engine.loadModel("model-a");
      await engine.loadModel("model-b");
      await engine.loadModel("model-c");

      await engine.unloadAllModels(engine.modelKey("model-b"));

      expect(engine.getResidentModels().map(model => model.modelId)).toEqual(["model-b"]);
      expect(fake.engines.map(e => e.worker.terminated)).toEqual([true, false, true]);
    });

    it("reload loads the same key again in a fresh engine, after freeing the old one", async () => {
      await engine.loadModel("model-a", small);
      const key = engine.modelKey("model-a", small);

      const reloading = engine.reloadModel(key);
      expect(engine.getResidentModels()[0]?.status).toBe("loading");
      await reloading;

      expect(fake.engines).toHaveLength(2);
      expect(fake.engines[0]?.unload).toHaveBeenCalled();
      expect(fake.engines[0]?.worker.terminated).toBe(true);
      expect(fake.engines[1]?.reload).toHaveBeenCalledWith("model-a", small);
      expect(engine.isModelLoaded("model-a", small)).toBe(true);
    });

    it("reload of a key that is not resident loads nothing", async () => {
      await engine.reloadModel(engine.modelKey("model-a"));
      expect(fake.engines).toHaveLength(0);
    });

    it("a reload waits for the answer running on that engine", async () => {
      await engine.loadModel("model-a");
      const key = engine.modelKey("model-a");
      const release = deferred();
      fake.create.mockImplementation(heldAnswer(release.promise, "old", "tail"));
      const answer = collect(engine.streamChat(key, messages));
      await vi.waitFor(() => expect(fake.create).toHaveBeenCalled());

      const reloading = engine.reloadModel(key);
      await tick();
      expect(fake.engines).toHaveLength(1);
      expect(fake.engines[0]?.unload).not.toHaveBeenCalled();

      release.resolve();
      expect(await answer).toEqual(["old", "tail"]);
      await reloading;
      expect(fake.engines).toHaveLength(2);
    });

    it("a load of another model does not wait for an answer on a resident engine", async () => {
      await engine.loadModel("model-a");
      const release = deferred();
      fake.create.mockImplementation(heldAnswer(release.promise, "a"));
      const answer = collect(engine.streamChat(engine.modelKey("model-a"), messages));
      await vi.waitFor(() => expect(fake.create).toHaveBeenCalled());

      await engine.loadModel("model-b");
      expect(engine.isModelLoaded("model-b")).toBe(true);

      release.resolve();
      await answer;
    });

    it("unload stops the answers running on it before freeing it", async () => {
      await engine.loadModel("model-a");
      const key = engine.modelKey("model-a");
      const release = deferred();
      fake.create.mockImplementation(heldAnswer(release.promise, "one", "two"));
      const answer = collect(engine.streamChat(key, messages));
      await vi.waitFor(() => expect(fake.create).toHaveBeenCalled());

      const unloading = engine.unloadModel(key);
      await tick();
      expect(fake.engines[0]?.interruptGenerate).toHaveBeenCalled();
      expect(fake.engines[0]?.worker.terminated).toBe(false);

      release.resolve();
      expect(await answer).toEqual(["one"]);
      await unloading;
      expect(fake.engines[0]?.worker.terminated).toBe(true);
    });

    it("notifies subscribers of every change of the resident models", async () => {
      const listener = vi.fn();
      const unsubscribe = engine.subscribeResidentModels(listener);
      await engine.loadModel("model-a");
      await engine.unloadModel(engine.modelKey("model-a"));
      unsubscribe();
      await engine.loadModel("model-b");

      // loading, ready, unloaded; nothing after unsubscribing.
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("isModelLoading is true for a model loading with any options", async () => {
      const load = deferred();
      fake.reload.mockReturnValue(load.promise);
      const loading = engine.loadModel("model-a", large);
      expect(engine.isModelLoading("model-a")).toBe(true);
      expect(engine.isModelLoading("model-b")).toBe(false);
      load.resolve();
      await loading;
      expect(engine.isModelLoading("model-a")).toBe(false);
    });
  });

  describe("streamChat", () => {
    const keyA = () => engine.modelKey("model-a");

    it("refuses to generate with a model that is not loaded", async () => {
      await expect(collect(engine.streamChat(keyA(), messages))).rejects.toThrow("No model is loaded yet.");
    });

    it("streams the text deltas of the key's engine and skips empty chunks", async () => {
      await engine.loadModel("model-a");
      fake.create.mockResolvedValue(chunks("Hel", undefined, "lo", "", "!"));

      expect(await collect(engine.streamChat(keyA(), messages, { temperature: 0.5 }))).toEqual(["Hel", "lo", "!"]);
      expect(fake.create).toHaveBeenCalledWith({ temperature: 0.5, messages, stream: true });
    });

    it("aborting the signal interrupts the engine and no more text is yielded", async () => {
      await engine.loadModel("model-a");
      fake.create.mockResolvedValue(chunks("one", "two", "three"));
      const controller = new AbortController();

      const out: string[] = [];
      for await (const text of engine.streamChat(keyA(), messages, {}, controller.signal)) {
        out.push(text);
        controller.abort();
      }

      expect(out).toEqual(["one"]);
      expect(fake.engines[0]?.interruptGenerate).toHaveBeenCalled();
    });

    it("a stop before the first token still ends the answer", async () => {
      await engine.loadModel("model-a");
      const created = deferred();
      fake.create.mockImplementation(async () => {
        await created.promise;
        return chunks("late", "text");
      });
      const controller = new AbortController();

      const result = collect(engine.streamChat(keyA(), messages, {}, controller.signal));
      await vi.waitFor(() => expect(fake.create).toHaveBeenCalled());
      controller.abort();
      created.resolve();

      expect(await result).toEqual([]);
      // Once at the abort and again once the stream started, because WebLLM clears its flag when it starts.
      expect(fake.engines[0]?.interruptGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("answers on one engine run one after another, and Stop of a waiting one never interrupts the running one", async () => {
      await engine.loadModel("model-a");
      const release = deferred();
      fake.create.mockImplementationOnce(heldAnswer(release.promise, "first-1", "first-2"));
      const waiting = new AbortController();

      const first = collect(engine.streamChat(keyA(), messages));
      await vi.waitFor(() => expect(fake.create).toHaveBeenCalledTimes(1));
      const second = collect(engine.streamChat(keyA(), messages, {}, waiting.signal));
      await tick();
      expect(fake.create).toHaveBeenCalledTimes(1);

      waiting.abort();
      expect(fake.engines[0]?.interruptGenerate).not.toHaveBeenCalled();
      release.resolve();

      expect(await first).toEqual(["first-1", "first-2"]);
      expect(await second).toEqual([]);
      expect(fake.create).toHaveBeenCalledTimes(1);
    });

    it("answers on two engines run side by side", async () => {
      await engine.loadModel("model-a");
      await engine.loadModel("model-b");
      const release = deferred();
      fake.create.mockImplementationOnce(heldAnswer(release.promise, "a")).mockResolvedValueOnce(chunks("b"));

      const a = collect(engine.streamChat(keyA(), messages));
      await vi.waitFor(() => expect(fake.create).toHaveBeenCalledTimes(1));
      expect(await collect(engine.streamChat(engine.modelKey("model-b"), messages))).toEqual(["b"]);

      release.resolve();
      expect(await a).toEqual(["a"]);
    });
  });

  describe("model catalogue", () => {
    it("lists the prebuilt models in the app's shape, without creating an engine", async () => {
      expect(await engine.listPrebuiltModels()).toEqual([
        { id: "Chat-A-MLC", vramRequiredMB: 944.62, lowResourceRequired: true, kind: "llm" },
        { id: "Chat-B-MLC", vramRequiredMB: 5001, lowResourceRequired: false, kind: "llm" },
        { id: "Embed-MLC", vramRequiredMB: 300, lowResourceRequired: false, kind: "embedding" },
        { id: "Vision-MLC", vramRequiredMB: null, lowResourceRequired: false, kind: "vlm" }
      ]);
      expect(fake.engines).toHaveLength(0);
    });

    it("asks WebLLM's cache whether a model is downloaded", async () => {
      fake.hasModelInCache.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      expect(await engine.isModelCached("Chat-A-MLC")).toBe(true);
      expect(await engine.isModelCached("Chat-B-MLC")).toBe(false);
      expect(fake.hasModelInCache).toHaveBeenCalledWith("Chat-A-MLC");
      expect(fake.engines).toHaveLength(0);
    });

    it("answers not cached when the cache cannot be read", async () => {
      fake.hasModelInCache.mockReset().mockRejectedValue(new Error("SecurityError"));
      expect(await engine.isModelCached("Chat-A-MLC")).toBe(false);
    });
  });

  describe("model cache (Phase 11)", () => {
    const MANIFEST_A = "https://huggingface.co/mlc-ai/Chat-A-MLC/resolve/main/tensor-cache.json";
    const deleted: string[] = [];

    beforeEach(() => {
      deleted.length = 0;
      // Cache Storage with only Chat-A's weights manifest (two shards).
      vi.stubGlobal("caches", {
        open: async () => ({
          match: async (url: string) =>
            url === MANIFEST_A
              ? new Response(JSON.stringify({ records: [{ nbytes: 300 * 1024 * 1024 }, { nbytes: 20 * 1024 * 1024 }] }))
              : undefined,
          delete: async (url: string) => {
            deleted.push(url);
            return true;
          }
        })
      });
      fake.hasModelInCache.mockReset().mockImplementation(async id => id === "Chat-A-MLC");
      fake.deleteModelAllInfoInCache.mockReset().mockResolvedValue(undefined);
    });

    it("lists the cached models with the size of their weights from the cached manifest", async () => {
      expect(await engine.listCachedModels()).toEqual([
        { id: "Chat-A-MLC", sizeBytes: 320 * 1024 * 1024, vramRequiredMB: 944.62 }
      ]);
      expect(fake.engines).toHaveLength(0);
    });

    it("deletes every cached file of a model through WebLLM, and its manifest", async () => {
      await engine.deleteCachedModel("Chat-A-MLC");
      expect(fake.deleteModelAllInfoInCache).toHaveBeenCalledWith("Chat-A-MLC");
      expect(deleted).toEqual([MANIFEST_A]);
    });

    it("refuses to delete a model while it is loading", async () => {
      const load = deferred();
      fake.reload.mockReturnValue(load.promise);
      const loading = engine.loadModel("Chat-A-MLC");
      await vi.waitFor(() => expect(fake.engines[0]?.reload).toHaveBeenCalled());

      expect(engine.isModelLoading("Chat-A-MLC")).toBe(true);
      await expect(engine.deleteCachedModel("Chat-A-MLC")).rejects.toThrow(/loading right now/);
      expect(fake.deleteModelAllInfoInCache).not.toHaveBeenCalled();

      load.resolve();
      await loading;
      expect(engine.isModelLoading("Chat-A-MLC")).toBe(false);
    });
  });
});
