import { create } from "zustand";

import {
  chatReducer,
  historyForModel,
  initialChatState,
  withSystemPrompt,
  type ChatState
} from "@/components/chat/chatState";
import { fitToContext, isContextOverflow, RETRY_BUDGET_SCALE, type ContextSettings } from "@/lib/llm/context";
import { streamChat, unloadAllModels, type ChatMessage, type GenerationParams, type ModelKey } from "@/lib/llm/engine";
import { toFailure, type EngineFailure } from "@/lib/llm/errors";
import { useAuthStore } from "@/store/useAuthStore";

/** What the chat says under the composer about the history the model no longer sees. */
export interface ContextNote {
  dropped: number;
  systemPromptTruncated: boolean;
}

/** One assistant's conversation, kept while the user goes to another assistant or page. */
export interface Conversation {
  chat: ChatState;
  contextNote: ContextNote;
  /** Why the last answer failed (shown in the chat), never a context overflow (that one is "message too long"). */
  error: EngineFailure | null;
  /** The navigation ("New chat") that started this conversation, so that seeing it again does not empty it twice. */
  startedBy: string | null;
}

export interface SendRequest {
  text: string;
  /** The assistant's current system prompt: it replaces the conversation's first message. */
  systemPrompt: string;
  settings: ContextSettings;
  params: GenerationParams;
  /** The resident model that answers (`modelKey` of the assistant's model and load options). */
  modelKey: ModelKey;
}

/**
 * How an answer ended: `answered` (finished, stopped, or failed, with the failure in the conversation's `error`), or
 * `overflow` (WebLLM refused the message before the first token, denser than the estimate: it was withdrawn).
 */
export type AnswerEnd = "answered" | "overflow";

// Known at once, so the composer is emptied only for a message that was really sent.
export type SendOutcome =
  /** Blank, or an answer is still running: nothing was sent. */
  | { status: "ignored" }
  /** The message alone does not fit the context window: nothing was sent, the draft stays. */
  | { status: "tooLong"; messageTokens: number; budget: number }
  /** Sent: the answer streams into the conversation, and `answer` settles when it ends. */
  | { status: "sent"; answer: Promise<AnswerEnd> };

interface ConversationState {
  conversations: Readonly<Record<string, Conversation>>;
  /** Sends `text` and streams the answer into the assistant's conversation, also while its chat is not on screen. */
  send: (assistantId: string, request: SendRequest) => SendOutcome;
  /** Stops the assistant's running answer (the Stop button). */
  stop: (assistantId: string) => void;
  /** Starts an empty conversation for the assistant ("New chat"), stopping its running answer. */
  newChat: (assistantId: string, startedBy: string | null) => void;
  /** Forgets the assistant's conversation (the assistant was deleted). */
  drop: (assistantId: string) => void;
  /** Forgets every conversation (logout). */
  clear: () => void;
}

const NO_NOTE: ContextNote = { dropped: 0, systemPromptTruncated: false };

export const EMPTY_CONVERSATION: Conversation = {
  chat: initialChatState(""),
  contextNote: NO_NOTE,
  error: null,
  startedBy: null
};

// The answer being streamed per assistant. Its controller stops it; its identity tells a late chunk of an answer
// whose conversation was emptied or dropped meanwhile from the current one.
interface Run {
  controller: AbortController;
}
const runs = new Map<string, Run>();

function abortRun(assistantId: string): void {
  runs.get(assistantId)?.controller.abort();
  runs.delete(assistantId);
}

// The conversations, per assistant id, in memory only: no `persist`, because chat content must never reach
// localStorage or sessionStorage (prompts and answers stay in this tab and are gone on reload or logout). The answer
// loop lives here, not in a component, so an answer keeps streaming into its conversation when the user leaves the
// chat, and is there when they come back.
export const useConversationStore = create<ConversationState>()((set, get) => {
  const update = (assistantId: string, change: (conversation: Conversation) => Conversation) =>
    set(state => ({
      conversations: {
        ...state.conversations,
        [assistantId]: change(state.conversations[assistantId] ?? EMPTY_CONVERSATION)
      }
    }));

  return {
    conversations: {},

    send: (assistantId, { text, systemPrompt, settings, params, modelKey }) => {
      const current = get().conversations[assistantId] ?? EMPTY_CONVERSATION;
      const base = withSystemPrompt(current.chat, systemPrompt);
      const next = chatReducer(base, { type: "send", text });
      if (next === base || runs.has(assistantId)) return { status: "ignored" };
      const history = historyForModel(next);
      const fit = fitToContext(history, settings);
      if (!fit.ok) return { status: "tooLong", messageTokens: fit.messageTokens, budget: fit.budget };
      const retry = fitToContext(history, settings, RETRY_BUDGET_SCALE);
      const messages = fit.messages;
      const retryMessages = retry.ok ? retry.messages : null;

      const run: Run = { controller: new AbortController() };
      runs.set(assistantId, run);
      const isCurrent = () => runs.get(assistantId) === run;
      update(assistantId, conversation => ({
        ...conversation,
        chat: next,
        contextNote: { dropped: fit.dropped, systemPromptTruncated: fit.systemPromptTruncated },
        error: null
      }));

      const streamAnswer = async (): Promise<AnswerEnd> => {
        let received = false;
        const stream = async (history: ChatMessage[]) => {
          for await (const piece of streamChat(modelKey, history, params, run.controller.signal)) {
            received = true;
            if (!isCurrent()) continue;
            update(assistantId, conversation => ({
              ...conversation,
              chat: chatReducer(conversation.chat, { type: "appendAnswer", text: piece })
            }));
          }
        };
        let failure: EngineFailure | null = null;
        try {
          try {
            await stream(messages);
          } catch (error) {
            if (!retryMessages || received || !isContextOverflow(error)) throw error;
            console.warn("The prompt did not fit the context window; retrying with less history.", error);
            await stream(retryMessages);
          }
        } catch (error) {
          failure = toFailure(error, "answer");
        }

        // Emptied ("New chat") or dropped while it ran: that conversation is gone, nothing to finish.
        if (!isCurrent()) return "answered";
        runs.delete(assistantId);
        if (failure?.kind === "contextOverflow") {
          update(assistantId, conversation => ({
            ...conversation,
            chat: chatReducer(chatReducer(conversation.chat, { type: "finishAnswer" }), { type: "withdraw" })
          }));
          return "overflow";
        }
        update(assistantId, conversation => ({
          ...conversation,
          chat: chatReducer(conversation.chat, { type: "finishAnswer" }),
          error: failure
        }));
        return "answered";
      };
      return { status: "sent", answer: streamAnswer() };
    },

    stop: assistantId => runs.get(assistantId)?.controller.abort(),

    newChat: (assistantId, startedBy) => {
      abortRun(assistantId);
      set(state => ({
        conversations: { ...state.conversations, [assistantId]: { ...EMPTY_CONVERSATION, startedBy } }
      }));
    },

    drop: assistantId => {
      abortRun(assistantId);
      set(state => {
        if (!(assistantId in state.conversations)) return state;
        const conversations = { ...state.conversations };
        delete conversations[assistantId];
        return { conversations };
      });
    },

    clear: () => {
      for (const assistantId of [...runs.keys()]) abortRun(assistantId);
      set({ conversations: {} });
    }
  };
});

// Logging out (the button, a 401 or the session's expiry) ends everything the session had in this tab: the
// conversations are forgotten and the models leave GPU memory, so the next person to log in starts from nothing.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) {
    useConversationStore.getState().clear();
    void unloadAllModels();
  }
});
