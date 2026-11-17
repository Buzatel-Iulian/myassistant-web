import { describe, expect, it } from "vitest";

import { formatVram, toChatModels } from "@/lib/llm/models";

describe("toChatModels", () => {
  it("keeps only chat models, in order", () => {
    const models = toChatModels([
      { id: "A-MLC", vramRequiredMB: 900, lowResourceRequired: true, kind: "llm" },
      { id: "E-MLC", vramRequiredMB: 300, lowResourceRequired: true, kind: "embedding" },
      { id: "V-MLC", vramRequiredMB: 4000, lowResourceRequired: false, kind: "vlm" },
      { id: "B-MLC", vramRequiredMB: null, lowResourceRequired: false, kind: "llm" }
    ]);
    expect(models).toEqual([
      { id: "A-MLC", vramRequiredMB: 900, lowResourceRequired: true },
      { id: "B-MLC", vramRequiredMB: null, lowResourceRequired: false }
    ]);
  });
});

describe("formatVram", () => {
  it("shows gigabytes with one decimal", () => {
    expect(formatVram(944.62)).toBe("0.9 GB VRAM");
    expect(formatVram(5001)).toBe("4.9 GB VRAM");
    expect(formatVram(null)).toBe("VRAM unknown");
  });
});
