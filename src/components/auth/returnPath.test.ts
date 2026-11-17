import { describe, expect, it } from "vitest";

import { returnPathFrom, returnStateFor } from "@/components/auth/returnPath";

describe("return path after login", () => {
  it("keeps the query string and the hash (QA-7-2)", () => {
    const state = returnStateFor({ pathname: "/templates/t1", search: "?tab=preview", hash: "#vars" });
    expect(state).toEqual({ from: "/templates/t1?tab=preview#vars" });
    expect(returnPathFrom(state)).toBe("/templates/t1?tab=preview#vars");
  });

  it("falls back to the chat without a usable path", () => {
    expect(returnPathFrom(null)).toBe("/chat");
    expect(returnPathFrom(undefined)).toBe("/chat");
    expect(returnPathFrom({ from: 42 })).toBe("/chat");
    expect(returnPathFrom({ from: "https://evil.example" })).toBe("/chat");
  });

  it("never leaves the app through a protocol-relative URL", () => {
    expect(returnPathFrom({ from: "//evil.example/chat" })).toBe("/chat");
  });
});
