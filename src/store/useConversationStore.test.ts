// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage, GenerationParams } from "@/lib/llm/engine";

// The engine is replaced by a scripted one: each answer is a list of text pieces, optionally held until released.
const fake = vi.hoisted(() => ({
  streamChat: null as unknown as ReturnType<
    typeof vi.fn<
      (key: string, messages: ChatMessage[], params?: GenerationParams, signal?: AbortSignal) => AsyncGenerator<string>
    >
  >,
  unloadAllModels: null as unknown as ReturnType<typeof vi.fn<() => Promise<void>>>
}));

vi.mock("@/lib/llm/engine", () => ({
  streamChat: (key: string, messages: ChatMessage[], params?: GenerationParams, signal?: AbortSignal) =>
    fake.streamChat(key, messages, params, signal),
  unloadAllModels: () => fake.unloadAllModels()
}));

type Store = typeof import("@/store/useConversationStore");
type Auth = typeof import("@/store/useAuthStore");

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(res => (resolve = res));
  return { promise, resolve };
}

// An answer that yields `first`, waits for `release` (or the abort of its signal), then yields `rest` unless stopped.
function heldAnswer(release: Promise<void>, first: string, ...rest: string[]) {
  return async function* (_key: string, _messages: ChatMessage[], _params?: GenerationParams, signal?: AbortSignal) {
    yield first;
    await Promise.race([release, new Promise(resolve => signal?.addEventListener("abort", resolve))]);
    if (signal?.aborted) return;
    for (const text of rest) yield text;
  };
}

async function* pieces(...texts: string[]) {
  for (const text of texts) yield text;
}

const SETTINGS = { contextWindowSize: 4096, maxTokens: 512 };
const request = (text: string, systemPrompt = "Be brief.") => ({
  text,
  systemPrompt,
  settings: SETTINGS,
  params: { temperature: 0.5 },
  modelKey: "model-a|4096|-1"
});

describe("useConversationStore", () => {
  let store: Store;
  let auth: Auth;
  const conversation = (id: string) => store.useConversationStore.getState().conversations[id];
  const shown = (id: string) => conversation(id)?.chat.messages.filter(message => message.role !== "system");

  beforeEach(async () => {
    vi.resetModules();
    sessionStorage.clear();
    fake.streamChat = vi.fn();
    fake.unloadAllModels = vi.fn().mockResolvedValue(undefined);
    auth = await import("@/store/useAuthStore");
    store = await import("@/store/useConversationStore");
  });

  function send(id: string, text: string, systemPrompt?: string) {
    const outcome = store.useConversationStore.getState().send(id, request(text, systemPrompt));
    if (outcome.status !== "sent") throw new Error(`not sent: ${outcome.status}`);
    return outcome.answer;
  }

  it("streams the answer into the assistant's conversation, with its model key and settings", async () => {
    fake.streamChat.mockImplementation(() => pieces("Hel", "lo"));

    expect(await send("a1", "Say hi")).toBe("answered");

    expect(shown("a1")).toEqual([
      { role: "user", content: "Say hi" },
      { role: "assistant", content: "Hello" }
    ]);
    expect(conversation("a1")?.chat.isAnswering).toBe(false);
    const [key, messages, params] = fake.streamChat.mock.calls[0] ?? [];
    expect(key).toBe("model-a|4096|-1");
    expect(messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Say hi" }
    ]);
    expect(params).toEqual({ temperature: 0.5 });
  });

  it("keeps one conversation per assistant", async () => {
    fake.streamChat.mockImplementationOnce(() => pieces("A")).mockImplementationOnce(() => pieces("B"));
    await send("a1", "to one");
    await send("a2", "to two");

    expect(shown("a1")?.map(message => message.content)).toEqual(["to one", "A"]);
    expect(shown("a2")?.map(message => message.content)).toEqual(["to two", "B"]);
  });

  it("an answer keeps streaming into its conversation while nobody shows it, and Stop still ends it", async () => {
    const release = deferred();
    fake.streamChat.mockImplementation(heldAnswer(release.promise, "part one", " part two"));
    const answer = send("a1", "long story");
    await vi.waitFor(() => expect(shown("a1")?.at(-1)?.content).toBe("part one"));
    expect(conversation("a1")?.chat.isAnswering).toBe(true);

    store.useConversationStore.getState().stop("a1");
    expect(await answer).toBe("answered");
    expect(shown("a1")?.at(-1)).toEqual({ role: "assistant", content: "part one" });
    expect(conversation("a1")?.chat.isAnswering).toBe(false);
  });

  it("Stop of one assistant does not stop another's answer", async () => {
    const release = deferred();
    fake.streamChat
      .mockImplementationOnce(heldAnswer(release.promise, "one", " more"))
      .mockImplementationOnce(heldAnswer(release.promise, "two", " more"));
    const first = send("a1", "x");
    const second = send("a2", "y");
    store.useConversationStore.getState().stop("a1");
    release.resolve();
    await Promise.all([first, second]);

    expect(shown("a1")?.at(-1)?.content).toBe("one");
    expect(shown("a2")?.at(-1)?.content).toBe("two more");
  });

  it("ignores a blank message and a message sent while answering", async () => {
    const release = deferred();
    fake.streamChat.mockImplementation(heldAnswer(release.promise, "x"));
    const state = () => store.useConversationStore.getState();
    expect(state().send("a1", request("   ")).status).toBe("ignored");
    const answer = send("a1", "first");
    expect(state().send("a1", request("second")).status).toBe("ignored");
    release.resolve();
    await answer;
    expect(fake.streamChat).toHaveBeenCalledTimes(1);
  });

  it("refuses a message that does not fit the context window, without touching the conversation", () => {
    const outcome = store.useConversationStore
      .getState()
      .send("a1", { ...request("x".repeat(20_000)), settings: { contextWindowSize: 1024, maxTokens: 256 } });
    expect(outcome.status).toBe("tooLong");
    expect(conversation("a1")).toBeUndefined();
    expect(fake.streamChat).not.toHaveBeenCalled();
  });

  it("withdraws a message the model refused before the first token (context overflow)", async () => {
    fake.streamChat.mockImplementation(async function* () {
      yield* [];
      throw new Error("ContextWindowSizeExceededError: Prompt tokens exceed context window size");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await send("a1", "dense")).toBe("overflow");
    expect(shown("a1")).toEqual([]);
    expect(conversation("a1")?.error).toBeNull();
  });

  it("keeps a failure of the answer in the conversation", async () => {
    fake.streamChat.mockImplementation(async function* () {
      yield "partial";
      throw new Error("something broke");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await send("a1", "q")).toBe("answered");
    expect(conversation("a1")?.error?.title).toBe("The answer could not be generated");
    expect(shown("a1")?.at(-1)?.content).toBe("partial");
  });

  it("records the context note of the last request", async () => {
    fake.streamChat.mockImplementation(() => pieces("ok"));
    await send("a1", "q");
    expect(conversation("a1")?.contextNote).toEqual({ dropped: 0, systemPromptTruncated: false });
  });

  it("sends the assistant's current system prompt: an edit applies from the next message", async () => {
    fake.streamChat.mockImplementation(() => pieces("ok"));
    await send("a1", "first", "Old prompt.");
    await send("a1", "second", "New prompt.");

    const messages = fake.streamChat.mock.calls[1]?.[1];
    expect(messages?.[0]).toEqual({ role: "system", content: "New prompt." });
    expect(messages?.map(message => message.content)).toEqual(["New prompt.", "first", "ok", "second"]);
  });

  it("New chat empties the conversation, stops its answer, and a late piece does not come back", async () => {
    const release = deferred();
    fake.streamChat.mockImplementation(heldAnswer(release.promise, "old", " tail"));
    const answer = send("a1", "question");
    await vi.waitFor(() => expect(shown("a1")?.length).toBe(2));

    store.useConversationStore.getState().newChat("a1", "nav-1");
    release.resolve();
    await answer;

    expect(shown("a1")).toEqual([]);
    expect(conversation("a1")?.chat.isAnswering).toBe(false);
    expect(conversation("a1")?.startedBy).toBe("nav-1");
    const signal = fake.streamChat.mock.calls[0]?.[3];
    expect(signal?.aborted).toBe(true);
  });

  it("drop forgets one assistant's conversation (assistant deleted)", async () => {
    fake.streamChat.mockImplementation(() => pieces("ok"));
    await send("a1", "q");
    await send("a2", "q");
    store.useConversationStore.getState().drop("a1");

    expect(conversation("a1")).toBeUndefined();
    expect(conversation("a2")).toBeDefined();
  });

  it("logout forgets every conversation, stops the answers and unloads every model", async () => {
    auth.useAuthStore.getState().login({ token: "t", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const release = deferred();
    fake.streamChat.mockImplementation(heldAnswer(release.promise, "x", "y"));
    const answer = send("a1", "q");

    auth.useAuthStore.getState().logout();
    release.resolve();
    await answer;

    expect(store.useConversationStore.getState().conversations).toEqual({});
    expect(fake.streamChat.mock.calls[0]?.[3]?.aborted).toBe(true);
    expect(fake.unloadAllModels).toHaveBeenCalledTimes(1);
  });

  it("never writes a conversation to web storage", async () => {
    fake.streamChat.mockImplementation(() => pieces("secret answer"));
    await send("a1", "secret question");

    const stored = [localStorage, sessionStorage].flatMap(storage =>
      Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? "") ?? "")
    );
    expect(stored.join(" ")).not.toMatch(/secret/);
  });
});
