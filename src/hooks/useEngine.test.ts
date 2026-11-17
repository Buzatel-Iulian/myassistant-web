import { afterEach, describe, expect, it, vi } from "vitest";

import { errorMessage } from "@/hooks/useEngine";

describe("errorMessage (QA-8-1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the message of an Error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(errorMessage(new Error("Out of memory"))).toBe("Out of memory");
  });

  it("keeps the cause the worker sends as a string, and logs the raw value", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(errorMessage("TypeError: Failed to fetch")).toBe("TypeError: Failed to fetch");
    expect(log).toHaveBeenCalledWith("Local model error:", "TypeError: Failed to fetch");
  });

  it("falls back to a readable message when there is no cause", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(errorMessage({})).toBe("Something went wrong in the local model.");
    expect(errorMessage("  ")).toBe("Something went wrong in the local model.");
  });
});
