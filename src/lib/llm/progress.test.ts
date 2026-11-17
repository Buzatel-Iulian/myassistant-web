import { describe, expect, it } from "vitest";

import { describeLoadText, formatElapsed, isIndeterminate, loadStage, STAGE_LABELS } from "@/lib/llm/progress";

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

// Real reports of WebLLM 0.2.88 during a cold load of SmolLM2-360M-Instruct-q4f16_1-MLC (QA-11-A-4 probe).
const REAL = {
  start: "Start to fetch params",
  fetch3:
    "Fetching param cache[3/7]: 95MB fetched. 48% completed, 44 secs elapsed. It can take a while when we first visit this page to populate the cache. Later refreshes will become faster.",
  load5: "Loading model from cache[5/7]: 159MB loaded. 81% completed, 66 secs elapsed.",
  shaders: "Loading GPU shader modules[4/4]: 100% completed, 1 secs elapsed.",
  done: "Finish loading on WebGPU - apple"
};

describe("describeLoadText (QA-11-A-4)", () => {
  it("maps each real report to its step", () => {
    expect(loadStage(REAL.start)).toBe("starting");
    expect(loadStage(REAL.fetch3)).toBe("downloading");
    expect(loadStage(REAL.load5)).toBe("loading");
    expect(loadStage(REAL.shaders)).toBe("shaders");
    expect(loadStage(REAL.done)).toBe("done");
  });

  it("explains the long wait before WebLLM's first report, with the size once the manifest is cached", () => {
    expect(describeLoadText(REAL.start, 0)).toMatch(/^Downloading the model\. .*32 MB pieces, four at a time/);
    expect(describeLoadText(REAL.start, 0, 195 * 1024 * 1024)).toMatch(/^Downloading 195 MB\./);
  });

  it("turns the download and GPU reports into MB of the total, without WebLLM's boilerplate", () => {
    expect(describeLoadText(REAL.fetch3, 0.489)).toBe("95 MB of about 194 MB downloaded (piece 3 of 7)");
    expect(describeLoadText(REAL.fetch3, 0.489, 195 * 1024 * 1024)).toBe("95 MB of 195 MB downloaded (piece 3 of 7)");
    expect(describeLoadText(REAL.load5, 0.817, 195 * 1024 * 1024)).toBe(
      "159 MB of 195 MB copied into GPU memory (piece 5 of 7)"
    );
    expect(describeLoadText(REAL.shaders, 1)).toBe("Compiling GPU programs (4 of 4)");
    expect(describeLoadText(REAL.done, 1)).toBe("Ready.");
  });

  it("keeps an unknown text as it is, and has a text before the first report", () => {
    expect(describeLoadText("Something new from WebLLM", 0.2)).toBe("Something new from WebLLM");
    expect(describeLoadText("", 0)).toBe("Starting the engine…");
  });

  it("formats the elapsed time", () => {
    expect(formatElapsed(4.7)).toBe("4 s");
    expect(formatElapsed(125)).toBe("2 min 05 s");
  });
});
