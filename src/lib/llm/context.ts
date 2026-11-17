import type { ChatMessage } from "@/lib/llm/engine";

// Context control: what is sent to the model has to fit in the assistant's context window next to the answer, or
// WebLLM refuses the request ("context window exceeded"). The model's tokenizer lives in the worker, so the size is
// estimated (about 4 characters per token, plus each message's chat-template markers); the margin this leaves is the
// answer's own room, and `retryBudgetScale` is the fallback for text that tokenizes worse than the estimate.

export const CHARS_PER_TOKEN = 4;
/** The chat template's markers around each message (`<|im_start|>user\n … <|im_end|>\n` and the like). */
export const MESSAGE_OVERHEAD_TOKENS = 8;
/** The marker that opens the answer (`<|im_start|>assistant\n`), part of the prompt too. */
export const REPLY_PRIMER_TOKENS = 8;
/** The room a conversation needs next to the system prompt; less than this and the system prompt is reported. */
export const MIN_CONVERSATION_TOKENS = 64;
/** If the engine still reports an overflow (text denser than the estimate), the request is retried at this scale. */
export const RETRY_BUDGET_SCALE = 0.5;

export interface ContextSettings {
  contextWindowSize: number;
  maxTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function messageTokens(message: ChatMessage): number {
  return estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS;
}

/** The tokens the prompt (system prompt + kept messages) may use: the window minus the answer's room. */
export function contextBudget({ contextWindowSize, maxTokens }: ContextSettings, scale = 1): number {
  // The API guarantees maxTokens < contextWindowSize; the clamp keeps a hand-made value from giving a negative budget.
  return Math.max(0, Math.floor((contextWindowSize - maxTokens) * scale) - REPLY_PRIMER_TOKENS);
}

/** Whether the system prompt leaves room for a conversation; when not, the chat warns that it will be cut. */
export function systemPromptFits(systemPrompt: string, settings: ContextSettings): boolean {
  return estimateTokens(systemPrompt) + MESSAGE_OVERHEAD_TOKENS + MIN_CONVERSATION_TOKENS <= contextBudget(settings);
}

export type FitResult =
  | {
      ok: true;
      messages: ChatMessage[];
      /** How many earlier messages were left out (they stay on screen, the model no longer sees them). */
      dropped: number;
      /** The system prompt was cut to leave room for the latest message. */
      systemPromptTruncated: boolean;
    }
  | {
      ok: false;
      /** The latest message alone does not fit: it cannot be sent to this assistant as it is. */
      reason: "messageTooLong";
      messageTokens: number;
      budget: number;
    };

/**
 * Keeps what fits in `contextWindowSize - maxTokens` (times `scale`, the retry's tighter budget):
 * - the latest message (the user's question) always, whole; if it alone does not fit, nothing is sent;
 * - the system prompt always, cut at the end when it and the latest message together do not fit (QA-9-2: a template
 *   with long values can be larger than a small window); dropped only when no character of it fits;
 * - then the earlier messages, newest first, while they fit. The kept history starts on a user message, so the model
 *   never sees an answer without its question.
 * `messages` is the conversation as the chat holds it: the system prompt first, the latest user message last.
 */
export function fitToContext(messages: readonly ChatMessage[], settings: ContextSettings, scale = 1): FitResult {
  const budget = contextBudget(settings, scale);
  const system = messages[0]?.role === "system" ? messages[0] : null;
  const conversation = system ? messages.slice(1) : messages.slice();
  const latest = conversation.at(-1);
  if (!latest) return { ok: true, messages: system ? [system] : [], dropped: 0, systemPromptTruncated: false };

  const latestTokens = messageTokens(latest);
  if (latestTokens > budget) return { ok: false, reason: "messageTooLong", messageTokens: latestTokens, budget };

  let kept: ChatMessage[] = [];
  let used = latestTokens;
  let systemPromptTruncated = false;
  if (system) {
    const room = budget - used - MESSAGE_OVERHEAD_TOKENS;
    if (messageTokens(system) <= budget - used) {
      kept.push(system);
      used += messageTokens(system);
    } else {
      systemPromptTruncated = true;
      const chars = Math.max(0, room) * CHARS_PER_TOKEN;
      const content = system.content.slice(0, chars).trimEnd();
      if (content) {
        kept.push({ role: "system", content });
        used += estimateTokens(content) + MESSAGE_OVERHEAD_TOKENS;
      }
    }
  }

  const history: ChatMessage[] = [];
  for (let index = conversation.length - 2; index >= 0; index -= 1) {
    const message = conversation[index];
    if (!message) break;
    const tokens = messageTokens(message);
    // Stop at the first message that does not fit: skipping it and keeping older ones would leave a gap.
    if (used + tokens > budget) break;
    history.unshift(message);
    used += tokens;
  }
  while (history[0]?.role === "assistant") history.shift();

  kept = [...kept, ...history, latest];
  const dropped = conversation.length - 1 - history.length;
  return { ok: true, messages: kept, dropped, systemPromptTruncated };
}

/** Whether a failed request is WebLLM's context overflow (it reaches the page as text from the worker). */
export function isContextOverflow(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /ContextWindowSizeExceeded|exceed context window size/i.test(text);
}
