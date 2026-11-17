import { describe, expect, it } from "vitest";

import { formatBytes, modelBaseUrl, weightsBytes, weightsManifestUrl } from "@/lib/llm/cache";

describe("model cache helpers", () => {
  it("builds the folder WebLLM caches a model under, as its cleanModelUrl does", () => {
    expect(modelBaseUrl("https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC")).toBe(
      "https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/"
    );
    expect(modelBaseUrl("https://huggingface.co/mlc-ai/X/resolve/v1/")).toBe(
      "https://huggingface.co/mlc-ai/X/resolve/v1/"
    );
    expect(weightsManifestUrl("https://huggingface.co/mlc-ai/X")).toBe(
      "https://huggingface.co/mlc-ai/X/resolve/main/tensor-cache.json"
    );
  });

  it("sums the shard sizes of the weights manifest", () => {
    const manifest = {
      metadata: {},
      records: [{ dataPath: "params_shard_0.bin", nbytes: 32_000_000 }, { nbytes: 1_000 }]
    };
    expect(weightsBytes(manifest)).toBe(32_001_000);
  });

  it("gives no size for a manifest it does not understand", () => {
    expect(weightsBytes(null)).toBeNull();
    expect(weightsBytes({})).toBeNull();
    expect(weightsBytes({ records: [] })).toBeNull();
    expect(weightsBytes({ records: [{ nbytes: "12" }] })).toBeNull();
  });

  it("formats sizes for people", () => {
    expect(formatBytes(null)).toBe("size unknown");
    expect(formatBytes(2048)).toBe("2 kB");
    expect(formatBytes(276 * 1024 * 1024)).toBe("276 MB");
    expect(formatBytes(1.6 * 1024 * 1024 * 1024)).toBe("1.6 GB");
  });
});
