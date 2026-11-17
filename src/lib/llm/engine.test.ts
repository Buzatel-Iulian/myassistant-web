import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InitProgressReport } from "@mlc-ai/web-llm";

// A fake WebLLM: the real one needs WebGPU and a model download. It records what the engine module asks of it.
const fake = vi.hoisted(() => ({
  reload: vi.fn<(modelId: string) => Promise<void>>(),
  interruptGenerate: vi.fn<() => void>(),
  create: vi.fn<(request: { messages: unknown[]; stream: boolean }) => Promise<AsyncIterable<unknown>>>(),
  progress: null as ((report: { progress: number; timeElapsed: number; text: string }) => void) | null,
  instances: 0,
  hasModelInCache: vi.fn<(modelId: string) => Promise<boolean>>()
}));

vi.mock("@mlc-ai/web-llm", () => ({
  ModelType: { LLM: 0, embedding: 1, VLM: 2 },
  prebuiltAppConfig: {
    model_list: [
      { model_id: "Chat-A-MLC", vram_required_MB: 944.62, low_resource_required: true },
      { model_id: "Chat-B-MLC", vram_required_MB: 5001, low_resource_required: false, model_type: 0 },
      { model_id: "Embed-MLC", vram_required_MB: 300, model_type: 1 },
      { model_id: "Vision-MLC", model_type: 2 }
    ]
  },
  hasModelInCache: fake.hasModelInCache,
  WebWorkerMLCEngine: class {
    chat = { completions: { create: fake.create } };
    reload = fake.reload;
    interruptGenerate = fake.interruptGenerate;
    constructor(_worker: unknown, config: { initProgressCallback: typeof fake.progress }) {
      fake.instances += 1;
      fake.progress = config.initProgressCallback;
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

const noProgress = () => undefined;
const workers: { url: string; options: WorkerOptions }[] = [];

describe("engine", () => {
  let engine: EngineModule;

  beforeEach(async () => {
    // The module keeps one engine for the app; a fresh copy per test keeps the tests independent.
    vi.resetModules();
    fake.reload.mockReset().mockResolvedValue(undefined);
    fake.interruptGenerate.mockReset();
    fake.create.mockReset();
    fake.progress = null;
    fake.instances = 0;
    workers.length = 0;
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: URL, options: WorkerOptions) {
          workers.push({ url: String(url), options });
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
        text: "Fetching param cache[3/10]: 42%"
      });
      expect(engine.toLoadProgress(report(1.3)).value).toBe(1);
      expect(engine.toLoadProgress(report(-0.1)).value).toBe(0);
      expect(engine.toLoadProgress(report(Number.NaN)).value).toBe(0);
    });
  });

  describe("loadModel", () => {
    it("creates one engine and reports progress to the caller", async () => {
      const onProgress = vi.fn();
      fake.reload.mockImplementation(async () => {
        fake.progress?.({ progress: 0.5, timeElapsed: 1, text: "Fetching param cache: 50%" });
      });

      await engine.loadModel("model-a", onProgress);

      expect(fake.instances).toBe(1);
      expect(workers).toHaveLength(1);
      expect(workers[0]?.url).toMatch(/worker\.ts$/);
      expect(workers[0]?.options).toEqual({ type: "module" });
      expect(fake.reload).toHaveBeenCalledWith("model-a", undefined);
      expect(onProgress).toHaveBeenCalledWith({ value: 0.5, text: "Fetching param cache: 50%" });
      expect(engine.getLoadedModelId()).toBe("model-a");
    });

    it("does not reload a model that is already loaded", async () => {
      await engine.loadModel("model-a", noProgress);
      await engine.loadModel("model-a", noProgress);

      expect(fake.reload).toHaveBeenCalledTimes(1);
    });

    it("shares a load already in progress for the same model (double mount, two clicks)", async () => {
      const load = deferred();
      fake.reload.mockReturnValue(load.promise);

      const first = engine.loadModel("model-a", noProgress);
      const second = engine.loadModel("model-a", noProgress);
      load.resolve();
      await Promise.all([first, second]);

      expect(second).toBe(first);
      expect(fake.reload).toHaveBeenCalledTimes(1);
      expect(fake.instances).toBe(1);
    });

    it("waits for the current load before loading another model", async () => {
      const loadA = deferred();
      fake.reload.mockReturnValueOnce(loadA.promise);

      const first = engine.loadModel("model-a", noProgress);
      const second = engine.loadModel("model-b", noProgress);
      await vi.waitFor(() => expect(fake.reload).toHaveBeenCalledTimes(1));
      // Give the second load every chance to start early: it must not.
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(fake.reload).toHaveBeenCalledTimes(1);

      loadA.resolve();
      await Promise.all([first, second]);

      expect(fake.reload.mock.calls.map(call => call[0])).toEqual(["model-a", "model-b"]);
      expect(engine.getLoadedModelId()).toBe("model-b");
    });

    it("sends progress only to the latest caller", async () => {
      const load = deferred();
      fake.reload.mockReturnValue(load.promise);
      const old = vi.fn();
      const latest = vi.fn();

      const first = engine.loadModel("model-a", old);
      const second = engine.loadModel("model-a", latest);
      await vi.waitFor(() => expect(fake.progress).not.toBeNull());
      fake.progress?.({ progress: 0.1, timeElapsed: 0, text: "t" });
      load.resolve();
      await Promise.all([first, second]);

      expect(old).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledWith({ value: 0.1, text: "t" });
    });

    it("lets a failed load be retried, and does not block other loads", async () => {
      fake.reload.mockRejectedValueOnce(new Error("Network error"));

      await expect(engine.loadModel("model-a", noProgress)).rejects.toThrow("Network error");
      expect(engine.getLoadedModelId()).toBeNull();

      await engine.loadModel("model-a", noProgress);
      expect(fake.reload).toHaveBeenCalledTimes(2);
      expect(engine.getLoadedModelId()).toBe("model-a");
    });
  });

  describe("streamChat", () => {
    const messages = [
      { role: "system" as const, content: "You are a helpful assistant." },
      { role: "user" as const, content: "Say hi" }
    ];

    it("refuses to generate before a model is loaded", async () => {
      await expect(collect(engine.streamChat(messages))).rejects.toThrow("No model is loaded yet.");
    });

    it("streams the text deltas and skips empty chunks", async () => {
      await engine.loadModel("model-a", noProgress);
      fake.create.mockResolvedValue(chunks("Hel", undefined, "lo", "", "!"));

      expect(await collect(engine.streamChat(messages, { temperature: 0.5 }))).toEqual(["Hel", "lo", "!"]);
      expect(fake.create).toHaveBeenCalledWith({ temperature: 0.5, messages, stream: true });
    });

    it("stop() interrupts the engine and no more text is yielded", async () => {
      await engine.loadModel("model-a", noProgress);
      fake.create.mockResolvedValue(chunks("one", "two", "three"));

      const out: string[] = [];
      for await (const text of engine.streamChat(messages)) {
        out.push(text);
        engine.stop();
      }

      expect(out).toEqual(["one"]);
      expect(fake.interruptGenerate).toHaveBeenCalled();
    });

    it("a stop before the first token still ends the answer", async () => {
      await engine.loadModel("model-a", noProgress);
      const created = deferred();
      fake.create.mockImplementation(async () => {
        await created.promise;
        return chunks("late", "text");
      });

      const result = collect(engine.streamChat(messages));
      engine.stop();
      created.resolve();

      expect(await result).toEqual([]);
      // Once during the wait and again once the stream started, because WebLLM clears its flag when it starts.
      expect(fake.interruptGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("a new answer is not affected by an earlier stop", async () => {
      await engine.loadModel("model-a", noProgress);
      engine.stop();
      fake.create.mockResolvedValue(chunks("fresh"));

      expect(await collect(engine.streamChat(messages))).toEqual(["fresh"]);
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
      expect(fake.instances).toBe(0);
      expect(workers).toHaveLength(0);
    });

    it("asks WebLLM's cache whether a model is downloaded", async () => {
      fake.hasModelInCache.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      expect(await engine.isModelCached("Chat-A-MLC")).toBe(true);
      expect(await engine.isModelCached("Chat-B-MLC")).toBe(false);
      expect(fake.hasModelInCache).toHaveBeenCalledWith("Chat-A-MLC");
      expect(fake.instances).toBe(0);
    });

    it("answers not cached when the cache cannot be read", async () => {
      fake.hasModelInCache.mockReset().mockRejectedValue(new Error("SecurityError"));
      expect(await engine.isModelCached("Chat-A-MLC")).toBe(false);
    });
  });
});
