import { describe, expect, it } from "vitest";

import { canRetryAlone, modelView, planLoad } from "@/components/chat/loadPlan";
import type { ResidentModel } from "@/lib/llm/engine";
import { describeEngineError } from "@/lib/llm/errors";

const resident = (
  modelId: string,
  window: number | null,
  status: ResidentModel["status"] = "ready"
): ResidentModel => ({
  key: `${modelId}|${window ?? ""}|-1`,
  modelId,
  contextWindowSize: window,
  status
});

const VRAM = new Map<string, number | null>([
  ["Small", 1024],
  ["Coder", 2048],
  ["Mystery", null]
]);

const OOM = describeEngineError("DeviceLostError: The WebGPU device was lost while loading the model.", "load");
const OFFLINE = describeEngineError("TypeError: Failed to fetch", "load");

describe("modelView", () => {
  it("shows the chat for a resident model and the loader for one loading, whatever the last failure", () => {
    expect(modelView("ready", null)).toBe("ready");
    expect(modelView("ready", OOM)).toBe("ready");
    expect(modelView("loading", OOM)).toBe("loading");
  });

  it("asks for confirmation when the model is not resident: never a load without it", () => {
    expect(modelView(null, null)).toBe("confirm");
  });

  it("shows the failure of the last load when the model is not resident", () => {
    expect(modelView(null, OOM)).toBe("error");
  });
});

describe("planLoad", () => {
  it("a first load: the model's estimate, nothing resident, no Replace", () => {
    const plan = planLoad("Small|4096|-1", "Small", [], VRAM);
    expect(plan).toEqual({
      vramMB: 1024,
      resident: [],
      residentMB: 0,
      totalMB: 1024,
      partial: false,
      canReplace: false
    });
  });

  it("lists the other resident models with their estimates and the totals, and offers Replace", () => {
    const plan = planLoad("Coder|4096|-1", "Coder", [resident("Small", 4096)], VRAM);
    expect(plan.resident).toEqual([{ ...resident("Small", 4096), vramMB: 1024 }]);
    expect(plan.residentMB).toBe(1024);
    expect(plan.totalMB).toBe(3072);
    expect(plan.canReplace).toBe(true);
  });

  it("does not count the key being loaded among the others (the same key is never loaded twice)", () => {
    const self = resident("Small", 4096);
    const plan = planLoad(self.key, "Small", [self], VRAM);
    expect(plan.resident).toEqual([]);
    expect(plan.canReplace).toBe(false);
  });

  it("counts the same model with another window as another resident copy", () => {
    const plan = planLoad(resident("Small", 4096).key, "Small", [resident("Small", 1024)], VRAM);
    expect(plan.resident).toHaveLength(1);
    expect(plan.totalMB).toBe(2048);
  });

  it("marks the totals as partial when an estimate is unknown", () => {
    expect(planLoad("Mystery||", "Mystery", [], VRAM).partial).toBe(true);
    expect(planLoad("Small||", "Small", [resident("Mystery", null)], VRAM)).toMatchObject({
      partial: true,
      residentMB: 0,
      totalMB: 1024
    });
    expect(planLoad("Small||", "Small", [], new Map()).vramMB).toBeNull();
  });
});

describe("canRetryAlone", () => {
  const key = resident("Coder", 4096).key;

  it("offers 'Unload other models and try again' after a GPU memory failure with other models resident", () => {
    expect(canRetryAlone(OOM, key, [resident("Small", 4096)])).toBe(true);
  });

  it("does not offer it without other resident models, or for another failure", () => {
    expect(canRetryAlone(OOM, key, [])).toBe(false);
    expect(canRetryAlone(OOM, key, [resident("Coder", 4096)])).toBe(false);
    expect(canRetryAlone(OFFLINE, key, [resident("Small", 4096)])).toBe(false);
    expect(canRetryAlone(null, key, [resident("Small", 4096)])).toBe(false);
  });
});
