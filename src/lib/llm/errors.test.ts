import { afterEach, describe, expect, it, vi } from "vitest";

import { describeEngineError, engineErrorKind, errorText, shortDetails, toFailure } from "@/lib/llm/errors";

// The texts below are what WebLLM 0.2.88 and Chrome produce; a failure in the worker reaches the page as a string.
const DEVICE_LOST =
  "DeviceLostError: The WebGPU device was lost while loading the model. This issue often occurs due to running out " +
  "of memory (OOM). To resolve this, try reloading with a model that has fewer parameters or uses a smaller context length.";
const OVERFLOW =
  "ContextWindowSizeExceededError: Prompt tokens exceed context window size: number of prompt tokens: 1526; context " +
  "window size: 1024\nConsider shortening the prompt, or increase `context_window_size`, or using sliding window via `sliding_window_size`.";

describe("engineErrorKind", () => {
  it("recognises running out of GPU memory (OOM / lost device)", () => {
    expect(engineErrorKind(DEVICE_LOST)).toBe("gpuMemory");
    expect(engineErrorKind(new Error("GPUOutOfMemoryError: Out of memory"))).toBe("gpuMemory");
    expect(
      engineErrorKind("Error: Cannot initialize runtime because of requested maxStorageBufferBindingSize exceeds limit")
    ).toBe("gpuMemory");
  });

  it("recognises a failed download (offline, blocked host)", () => {
    expect(engineErrorKind("TypeError: Failed to fetch")).toBe("download");
    expect(engineErrorKind(new TypeError("NetworkError when attempting to fetch resource."))).toBe("download");
    expect(engineErrorKind("Error: Cannot fetch https://huggingface.co/x/resolve/main/tensor-cache.json")).toBe(
      "download"
    );
    expect(engineErrorKind(new TypeError("Failed to fetch dynamically imported module: /assets/index.js"))).toBe(
      "download"
    );
  });

  it("recognises the context overflow, a missing GPU feature and a full storage", () => {
    expect(engineErrorKind(OVERFLOW)).toBe("contextOverflow");
    expect(engineErrorKind("ShaderF16SupportError: This model requires WebGPU extension shader-f16")).toBe(
      "gpuUnsupported"
    );
    expect(engineErrorKind(new DOMException("Quota exceeded.", "QuotaExceededError"))).toBe("storage");
  });

  it("leaves anything else as other", () => {
    expect(engineErrorKind(new Error("Something odd"))).toBe("other");
    expect(engineErrorKind({})).toBe("other");
  });
});

describe("describeEngineError", () => {
  it("tells the user to pick a smaller model when the GPU runs out of memory", () => {
    const failure = describeEngineError(DEVICE_LOST, "load");
    expect(failure.title).toBe("Not enough GPU memory for this model");
    expect(failure.message).toMatch(/smaller model/);
    expect(failure.message).toMatch(/Edit assistant/);
  });

  it("explains a failed download, and says so when the browser is offline", () => {
    const online = describeEngineError("TypeError: Failed to fetch", "load", true);
    expect(online.title).toBe("The model could not be downloaded");
    expect(online.message).toMatch(/internet connection/);
    expect(online.message).toMatch(/huggingface\.co/);

    expect(describeEngineError("TypeError: Failed to fetch", "load", false).title).toBe("You are offline");
  });

  it("uses the chat's own 'message too long' wording for a context overflow (QA-10-1)", () => {
    const failure = describeEngineError(OVERFLOW, "answer");
    expect(failure.title).toBe("The message is too long for this assistant");
    expect(failure.message).toMatch(/Shorten it, or raise the context window in Edit assistant\./);
    expect(failure.message).not.toMatch(/sliding_window_size/);
  });

  it("names the action for an unknown failure and keeps only the first line of the cause", () => {
    const failure = describeEngineError("Error: boom\n    at Object.reload (worker.js:1:2)\n    at run", "answer");
    expect(failure.title).toBe("The answer could not be generated");
    expect(failure.details).toBe("Error: boom");
    expect(describeEngineError(new Error("boom"), "load").title).toBe("The model could not be loaded");
  });
});

describe("error text helpers", () => {
  it("writes an Error as 'Name: message' and keeps a string from the worker", () => {
    expect(errorText(new TypeError("Failed to fetch"))).toBe("TypeError: Failed to fetch");
    expect(errorText(new Error("plain"))).toBe("plain");
    expect(errorText("  from the worker ")).toBe("from the worker");
    expect(errorText(42)).toBe("");
  });

  it("never shows a stack trace, and cuts a long line", () => {
    expect(shortDetails("    at a (b.js:1:1)\n    at c")).toBeNull();
    expect(shortDetails("x".repeat(500))?.length).toBe(240);
    expect(shortDetails("")).toBeNull();
  });
});

describe("toFailure (QA-8-1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the raw cause the worker sends as a string, and keeps its first line as the details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = toFailure("TypeError: Failed to fetch", "load");
    expect(failure.kind).toBe("download");
    expect(failure.details).toBe("TypeError: Failed to fetch");
    expect(log).toHaveBeenCalledWith("Local model error (load):", "TypeError: Failed to fetch");
  });

  it("falls back to a readable message when there is no cause", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = toFailure({}, "answer");
    expect(failure.title).toBe("The answer could not be generated");
    expect(failure.details).toBeNull();
  });
});
