import { describe, expect, it } from "vitest";

import { pickAssistant } from "@/components/chat/pickAssistant";

const a = { id: "a", favorite: false };
const b = { id: "b", favorite: true };
const c = { id: "c", favorite: true };

describe("pickAssistant", () => {
  it("opens the last used assistant when it still exists", () => {
    expect(pickAssistant([b, c, a], "a")).toBe(a);
  });

  it("falls back to the first favorite when the last used one is gone (or belongs to someone else)", () => {
    expect(pickAssistant([a, b, c], "deleted")).toBe(b);
    expect(pickAssistant([a, b, c], null)).toBe(b);
  });

  it("falls back to the first assistant when there is no favorite", () => {
    expect(pickAssistant([a, { id: "d", favorite: false }], null)).toBe(a);
  });

  it("is null without assistants", () => {
    expect(pickAssistant([], "a")).toBeNull();
  });
});
