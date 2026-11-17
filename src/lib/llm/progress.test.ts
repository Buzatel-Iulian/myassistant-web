import { describe, expect, it } from "vitest";

import { isIndeterminate, loadStage, STAGE_LABELS } from "@/lib/llm/progress";

// The texts are WebLLM 0.2.88's own reports.
describe("loadStage (QA-8-2)", () => {
  it("names each step of a load", () => {
    expect(loadStage("Start to fetch params")).toBe("starting");
    expect(
      loadStage("Fetching param cache[3/8]: 96MB fetched. 34% completed, 12 secs elapsed. It can take a while…")
    ).toBe("downloading");
    expect(loadStage("Loading model from cache[2/8]: 64MB loaded. 23% completed, 1 secs elapsed.")).toBe("loading");
    expect(loadStage("Loading GPU shader modules[12/80]: 15% completed, 2 secs elapsed.")).toBe("shaders");
    expect(loadStage("Finish loading on WebGPU - apple")).toBe("done");
    expect(loadStage("")).toBe("starting");
  });

  it("labels the download as a one-time step, so the restart of the bar at the GPU step is explained", () => {
    expect(STAGE_LABELS.downloading).toMatch(/first time only/);
    expect(STAGE_LABELS.loading).toMatch(/GPU memory/);
  });

  it("shows activity instead of a stuck 0 % before the first shard has arrived", () => {
    expect(isIndeterminate("starting", 0)).toBe(true);
    expect(isIndeterminate("downloading", 0)).toBe(true);
    expect(isIndeterminate("downloading", 0.1)).toBe(false);
    expect(isIndeterminate("loading", 0)).toBe(false);
  });
});
