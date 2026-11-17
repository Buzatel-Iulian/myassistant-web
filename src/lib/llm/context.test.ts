import { describe, expect, it } from "vitest";

import {
  contextBudget,
  estimateTokens,
  fitToContext,
  isContextOverflow,
  MESSAGE_OVERHEAD_TOKENS,
  REPLY_PRIMER_TOKENS,
  RETRY_BUDGET_SCALE,
  systemPromptFits
} from "@/lib/llm/context";
import type { ChatMessage } from "@/lib/llm/engine";

const system = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

/** A text of about `tokens` estimated tokens (4 characters each). */
const text = (tokens: number, letter = "a") => letter.repeat(tokens * 4);

// Budget = 1024 - 256 - 8 = 760 tokens.
const small = { contextWindowSize: 1024, maxTokens: 256 };

describe("estimateTokens", () => {
  it("counts about 4 characters per token, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("contextBudget", () => {
  it("is the context window minus the answer's room and the reply marker", () => {
    expect(contextBudget(small)).toBe(1024 - 256 - REPLY_PRIMER_TOKENS);
  });

  it("is smaller for the retry", () => {
    expect(contextBudget(small, RETRY_BUDGET_SCALE)).toBe(Math.floor(768 * 0.5) - REPLY_PRIMER_TOKENS);
  });

  it("is never negative", () => {
    expect(contextBudget({ contextWindowSize: 512, maxTokens: 600 })).toBe(0);
  });
});

describe("fitToContext", () => {
  it("keeps a short conversation whole", () => {
    const messages = [system("Be brief."), user("Hi"), assistant("Hello!"), user("How are you?")];

    expect(fitToContext(messages, small)).toEqual({
      ok: true,
      messages,
      dropped: 0,
      systemPromptTruncated: false
    });
  });

  it("drops the oldest messages first and keeps the system prompt and the latest ones", () => {
    const messages = [
      system("Be brief."),
      user(text(200, "1")),
      assistant(text(200, "2")),
      user(text(200, "3")),
      assistant(text(200, "4")),
      user("latest")
    ];

    const result = fitToContext(messages, small);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 760 tokens: system (~11) + latest (~10) + two messages of 208 = ~437; a third (208) still fits (~645), the
    // fourth does not. The kept history then starts on an assistant message, which is dropped too.
    expect(result.messages).toEqual([
      system("Be brief."),
      user(text(200, "3")),
      assistant(text(200, "4")),
      user("latest")
    ]);
    expect(result.dropped).toBe(2);
    expect(result.systemPromptTruncated).toBe(false);
  });

  it("never starts the kept history on an answer without its question", () => {
    const messages = [system("s"), user(text(500, "1")), assistant(text(300, "2")), user("latest")];

    const result = fitToContext(messages, small);

    expect(result.ok && result.messages).toEqual([system("s"), user("latest")]);
  });

  it("stays within the budget on a long chat", () => {
    const messages: ChatMessage[] = [system("You are a tutor.")];
    for (let turn = 0; turn < 50; turn += 1) messages.push(user(text(60)), assistant(text(120)));
    messages.push(user("one more question"));

    const result = fitToContext(messages, small);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const used = result.messages.reduce((sum, m) => sum + estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS, 0);
    expect(used).toBeLessThanOrEqual(contextBudget(small));
    expect(result.messages[0]).toEqual(system("You are a tutor."));
    expect(result.messages.at(-1)).toEqual(user("one more question"));
    expect(result.messages[1]?.role).toBe("user");
    expect(result.dropped).toBeGreaterThan(90);
  });

  it("cuts a system prompt that is larger than the window (QA-9-2) and keeps the latest message", () => {
    // A template of 8000 characters with 20 values of 1000: ~28k characters, ~7k tokens.
    const huge = system(text(7000, "s"));
    const messages = [huge, user("Bonjour !")];

    const result = fitToContext(messages, small);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.systemPromptTruncated).toBe(true);
    expect(result.messages.at(-1)).toEqual(user("Bonjour !"));
    const [first] = result.messages;
    expect(first?.role).toBe("system");
    expect(huge.content.startsWith(first?.content ?? "x")).toBe(true);
    const used = result.messages.reduce((sum, m) => sum + estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS, 0);
    expect(used).toBeLessThanOrEqual(contextBudget(small));
  });

  it("drops the history before it cuts the system prompt", () => {
    const messages = [system(text(700, "s")), user(text(100, "1")), assistant(text(100, "2")), user("latest")];

    const result = fitToContext(messages, small);

    expect(result.ok && result.messages.map(m => m.role)).toEqual(["system", "user"]);
    expect(result.ok && result.systemPromptTruncated).toBe(false);
  });

  it("refuses a latest message that alone does not fit", () => {
    const result = fitToContext([system("s"), user(text(800))], small);

    expect(result).toEqual({
      ok: false,
      reason: "messageTooLong",
      messageTokens: 800 + MESSAGE_OVERHEAD_TOKENS,
      budget: 760
    });
  });

  it("drops the system prompt entirely when the latest message leaves no room for it", () => {
    const result = fitToContext([system("Be brief."), user(text(752))], small);

    expect(result.ok && result.messages).toEqual([user(text(752))]);
    expect(result.ok && result.systemPromptTruncated).toBe(true);
  });

  it("fits less with the retry's tighter budget", () => {
    const messages = [system("s"), user(text(200, "1")), assistant(text(200, "2")), user("latest")];

    const full = fitToContext(messages, small);
    const retry = fitToContext(messages, small, RETRY_BUDGET_SCALE);

    expect(full.ok && full.messages).toHaveLength(4);
    expect(retry.ok && retry.messages).toEqual([system("s"), user("latest")]);
  });
});

describe("systemPromptFits", () => {
  it("accepts a prompt that leaves room for a conversation", () => {
    expect(systemPromptFits("You are a helpful assistant.", small)).toBe(true);
  });

  it("reports a prompt that fills the window", () => {
    expect(systemPromptFits(text(740), small)).toBe(false);
    expect(systemPromptFits(text(7000), small)).toBe(false);
  });
});

describe("isContextOverflow", () => {
  it("recognises WebLLM's error as the worker sends it (a string) and as an Error", () => {
    expect(
      isContextOverflow(
        "ContextWindowSizeExceededError: Prompt tokens exceed context window size: number of prompt tokens: 1100; " +
          "context window size: 1024"
      )
    ).toBe(true);
    const error = new Error("Prompt tokens exceed context window size: number of prompt tokens: 9");
    expect(isContextOverflow(error)).toBe(true);
  });

  it("does not mistake other failures for an overflow", () => {
    expect(isContextOverflow("TypeError: Failed to fetch")).toBe(false);
    expect(isContextOverflow(new Error("Device lost"))).toBe(false);
  });
});
