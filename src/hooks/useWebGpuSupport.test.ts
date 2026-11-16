import { describe, expect, it } from "vitest";

import { detectWebGpu } from "@/hooks/useWebGpuSupport";

describe("detectWebGpu", () => {
  it("is false when the browser has no navigator.gpu (Firefox, Safari without the flag)", async () => {
    expect(await detectWebGpu({})).toBe(false);
  });

  it("is false when WebGPU exists but no adapter is available (blocklisted or disabled GPU)", async () => {
    expect(await detectWebGpu({ gpu: { requestAdapter: async () => null } })).toBe(false);
  });

  it("is false when requesting the adapter throws", async () => {
    const gpu = {
      requestAdapter: async () => {
        throw new Error("GPU process crashed");
      }
    };
    expect(await detectWebGpu({ gpu })).toBe(false);
  });

  it("is true when an adapter is returned", async () => {
    expect(await detectWebGpu({ gpu: { requestAdapter: async () => ({ features: new Set() }) } })).toBe(true);
  });
});
