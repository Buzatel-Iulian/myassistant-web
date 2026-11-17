import { afterEach, describe, expect, it, vi } from "vitest";

import { toFailure } from "@/hooks/useEngine";

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
