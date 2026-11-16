import { describe, expect, it } from "vitest";

import { chatReducer, historyForModel, initialChatState, visibleMessages } from "@/components/chat/chatState";

const SYSTEM = "You are a helpful assistant.";

describe("chatReducer", () => {
  it("starts with only the system prompt, which is not shown", () => {
    const state = initialChatState(SYSTEM);

    expect(state.messages).toEqual([{ role: "system", content: SYSTEM }]);
    expect(state.isAnswering).toBe(false);
    expect(visibleMessages(state)).toEqual([]);
  });

  it("send adds the trimmed user message and an empty answer to stream into", () => {
    const state = chatReducer(initialChatState(SYSTEM), { type: "send", text: "  Say hi \n" });

    expect(state.messages.slice(1)).toEqual([
      { role: "user", content: "Say hi" },
      { role: "assistant", content: "" }
    ]);
    expect(state.isAnswering).toBe(true);
  });

  it("ignores a blank message and a message sent while answering", () => {
    const initial = initialChatState(SYSTEM);
    expect(chatReducer(initial, { type: "send", text: "  \n " })).toBe(initial);

    const answering = chatReducer(initial, { type: "send", text: "first" });
    expect(chatReducer(answering, { type: "send", text: "second" })).toBe(answering);
  });

  it("historyForModel is the conversation up to the user's message, in the OpenAI format", () => {
    const state = chatReducer(initialChatState(SYSTEM), { type: "send", text: "Say hi" });

    expect(historyForModel(state)).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say hi" }
    ]);
  });

  it("appendAnswer grows the last answer, without mutating the previous state", () => {
    const sent = chatReducer(initialChatState(SYSTEM), { type: "send", text: "Say hi" });
    const one = chatReducer(sent, { type: "appendAnswer", text: "Hel" });
    const two = chatReducer(one, { type: "appendAnswer", text: "lo!" });

    expect(two.messages.at(-1)).toEqual({ role: "assistant", content: "Hello!" });
    expect(one.messages.at(-1)).toEqual({ role: "assistant", content: "Hel" });
    expect(two.messages).not.toBe(one.messages);
  });

  it("appendAnswer is ignored when no answer is in progress", () => {
    const initial = initialChatState(SYSTEM);
    expect(chatReducer(initial, { type: "appendAnswer", text: "stray" })).toBe(initial);
  });

  it("finishAnswer keeps the answer and allows the next message", () => {
    let state = chatReducer(initialChatState(SYSTEM), { type: "send", text: "Say hi" });
    state = chatReducer(state, { type: "appendAnswer", text: "Hi!" });
    state = chatReducer(state, { type: "finishAnswer" });

    expect(state.isAnswering).toBe(false);
    expect(visibleMessages(state)).toEqual([
      { role: "user", content: "Say hi" },
      { role: "assistant", content: "Hi!" }
    ]);

    state = chatReducer(state, { type: "send", text: "Again" });
    expect(historyForModel(state)).toHaveLength(4);
  });

  it("finishAnswer drops an answer that never got a token (stopped or failed early)", () => {
    let state = chatReducer(initialChatState(SYSTEM), { type: "send", text: "Say hi" });
    state = chatReducer(state, { type: "finishAnswer" });

    expect(visibleMessages(state)).toEqual([{ role: "user", content: "Say hi" }]);
    expect(state.isAnswering).toBe(false);
  });
});
