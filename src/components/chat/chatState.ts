import type { ChatMessage } from "@/lib/llm/engine";

// The conversation in the OpenAI format the engine takes, system prompt included, so the whole array is sent as is.
export interface ChatState {
  messages: ChatMessage[];
  /** True from the moment a message is sent until its answer has ended (finished, stopped or failed). */
  isAnswering: boolean;
}

export type ChatAction =
  | { type: "send"; text: string }
  | { type: "appendAnswer"; text: string }
  | { type: "finishAnswer" }
  | { type: "withdraw" };

export function initialChatState(systemPrompt: string): ChatState {
  return { messages: [{ role: "system", content: systemPrompt }], isAnswering: false };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send": {
      const text = action.text.trim();
      if (!text || state.isAnswering) return state;
      // The empty assistant message is where the answer streams in, so the bubble exists before the first token.
      return {
        messages: [...state.messages, { role: "user", content: text }, { role: "assistant", content: "" }],
        isAnswering: true
      };
    }
    case "appendAnswer": {
      const last = state.messages.at(-1);
      if (!state.isAnswering || last?.role !== "assistant") return state;
      return {
        ...state,
        messages: [...state.messages.slice(0, -1), { role: "assistant", content: last.content + action.text }]
      };
    }
    case "finishAnswer": {
      if (!state.isAnswering) return state;
      const last = state.messages.at(-1);
      // Stopped or failed before the first token: an empty bubble would look like a blank answer.
      const messages = last?.role === "assistant" && last.content === "" ? state.messages.slice(0, -1) : state.messages;
      return { messages, isAnswering: false };
    }
    case "withdraw": {
      // A message the model refused without answering (it did not fit the context window, QA-10-1) goes back to
      // the composer, so it does not stay on screen as a question without an answer.
      if (state.isAnswering || state.messages.at(-1)?.role !== "user") return state;
      return { ...state, messages: state.messages.slice(0, -1) };
    }
  }
}

/** What is sent to the model: everything up to the user's latest message, without the empty answer placeholder. */
export function historyForModel(state: ChatState): ChatMessage[] {
  const last = state.messages.at(-1);
  return last?.role === "assistant" && last.content === "" ? state.messages.slice(0, -1) : state.messages;
}

/** The messages shown in the list: the system prompt is an instruction to the model, not part of the conversation. */
export function visibleMessages(state: ChatState): ChatMessage[] {
  return state.messages.filter(message => message.role !== "system");
}
