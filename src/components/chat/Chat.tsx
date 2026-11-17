import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useLocation } from "react-router";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { AssistantHeader } from "@/components/chat/AssistantHeader";
import { ChatInput } from "@/components/chat/ChatInput";
import { EmptyState } from "@/components/chat/EmptyState";
import { MessageList } from "@/components/chat/MessageList";
import { ModelLoader } from "@/components/chat/ModelLoader";
import { chatReducer, historyForModel, initialChatState, visibleMessages } from "@/components/chat/chatState";
import { LoadingPage } from "@/components/common/PageState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useEngine, type UseEngine } from "@/hooks/useEngine";
import { getConfiguration } from "@/lib/api/configurations";
import { contextBudget, estimateTokens, fitToContext, RETRY_BUDGET_SCALE, systemPromptFits } from "@/lib/llm/context";
import { systemPromptFor } from "@/lib/llm/prompt";
import { toChatOptions, type ChatOptions } from "@/lib/llm/settings";
import type { Configuration } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";

// The chat reads its assistant once when it opens: an edit made meanwhile applies to the next chat, never to the
// middle of this one (the model, the window and the prompt stay what the conversation started with).
const NO_CHANGES = [] as const;

function initials(name: string | undefined): string {
  const letters = (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "You";
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}

/**
 * The chat with one saved assistant (`/chat/:configId`). It is mounted once per assistant (keyed by its id), so
 * switching assistants starts from nothing: a new fetch, a new load if needed, a new conversation, and whatever the
 * previous assistant was still doing (loading, answering) can only reach the unmounted one.
 */
export function AssistantChat({ configId }: { configId: string }) {
  const loaded = useApiQuery(
    `chat-configuration:${configId}`,
    signal => getConfiguration(configId, signal),
    NO_CHANGES,
    "Could not load the assistant."
  );
  const setActiveConfigurationId = useAppStore(state => state.setActiveConfigurationId);
  const notFound = loaded.status === "error" && loaded.httpStatus === 404;
  const openedId = loaded.status === "ready" ? loaded.data.id : null;

  useEffect(() => {
    if (openedId) setActiveConfigurationId(openedId);
    // Deleted (or another user's id, which the API also answers with 404): do not reopen it next time.
    else if (notFound && useAppStore.getState().activeConfigurationId === configId) setActiveConfigurationId(null);
  }, [openedId, notFound, configId, setActiveConfigurationId]);

  if (loaded.status === "loading") return <LoadingPage label="Loading assistant" />;

  if (loaded.status === "error") {
    return (
      <Centered>
        <Alert variant="destructive" className="max-w-xl" data-testid="assistant-load-error">
          <CircleAlert />
          <AlertTitle>{notFound ? "This assistant does not exist" : "Could not load the assistant"}</AlertTitle>
          <AlertDescription>
            <p>{notFound ? "It may have been deleted, or the link is not one of your assistants." : loaded.message}</p>
            <Button variant="outline" size="sm" className="mt-3" render={<Link to="/assistants" />}>
              Back to your assistants
            </Button>
          </AlertDescription>
        </Alert>
      </Centered>
    );
  }

  return <LoadedAssistant configuration={loaded.data} />;
}

// Owns the model (load, progress, load errors); Conversation owns the messages. They are split so that "New chat"
// can start an empty conversation (a new key) without touching the model already loaded.
function LoadedAssistant({ configuration }: { configuration: Configuration }) {
  const engine = useEngine();
  const { load, status, progress, error } = engine;
  const location = useLocation();
  const { modelId } = configuration;
  const options = useMemo(() => toChatOptions(configuration.settings), [configuration.settings]);
  const systemPrompt = useMemo(() => systemPromptFor(configuration), [configuration]);

  useEffect(() => {
    void load(modelId, options.load);
  }, [load, modelId, options.load]);

  let body: React.ReactNode;
  if (status === "idle") {
    // One frame before the load effect runs; empty instead of a loader, which would flash for a model already loaded.
    body = null;
  } else if (status === "loading") {
    body = (
      <Centered>
        <ModelLoader modelId={modelId} progress={progress} />
      </Centered>
    );
  } else if (status === "error") {
    body = (
      <Centered>
        <Alert variant="destructive" className="max-w-xl">
          <CircleAlert />
          <AlertTitle>The model could not be loaded</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load(modelId, options.load)}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </Centered>
    );
  } else {
    // location.key changes on every navigation, also to the same URL, which is what the sidebar's "New chat" does.
    body = (
      <Conversation
        key={location.key}
        engine={engine}
        configuration={configuration}
        systemPrompt={systemPrompt}
        options={options}
      />
    );
  }

  return (
    <>
      <AssistantHeader configuration={configuration} />
      {body}
    </>
  );
}

interface ConversationProps {
  engine: UseEngine;
  configuration: Configuration;
  systemPrompt: string;
  options: ChatOptions;
}

interface ContextNote {
  dropped: number;
  systemPromptTruncated: boolean;
}

function Conversation({ engine, configuration, systemPrompt, options }: ConversationProps) {
  const { send, stop, status, error } = engine;
  const { settings } = configuration;
  const [state, dispatch] = useReducer(chatReducer, systemPrompt, initialChatState);
  const [draft, setDraft] = useState("");
  const [tooLong, setTooLong] = useState<string | null>(null);
  const [contextNote, setContextNote] = useState<ContextNote>({ dropped: 0, systemPromptTruncated: false });
  const userName = useAuthStore(store => store.user?.displayName);
  const messages = visibleMessages(state);
  const isAnswering = state.isAnswering || status === "generating";
  const budget = contextBudget(settings);
  const promptTooLarge = !systemPromptFits(systemPrompt, settings) || contextNote.systemPromptTruncated;

  // Leaving the page (or starting a new chat, or switching assistants) must not leave the GPU busy with an answer
  // nobody will see.
  useEffect(() => () => stop(), [stop]);

  async function handleSend() {
    const action = { type: "send", text: draft } as const;
    const next = chatReducer(state, action);
    if (next === state || isAnswering) return;
    const history = historyForModel(next);
    const fit = fitToContext(history, settings);
    if (!fit.ok) {
      setTooLong(
        `This message is about ${fit.messageTokens} tokens, and at most ${fit.budget} fit in this assistant's context ` +
          `window next to its answer. Shorten it, or raise the context window in Edit assistant.`
      );
      return;
    }
    const retry = fitToContext(history, settings, RETRY_BUDGET_SCALE);
    setTooLong(null);
    setContextNote({ dropped: fit.dropped, systemPromptTruncated: fit.systemPromptTruncated });
    dispatch(action);
    setDraft("");
    await send(
      { messages: fit.messages, params: options.request, retryMessages: retry.ok ? retry.messages : undefined },
      text => dispatch({ type: "appendAnswer", text })
    );
    dispatch({ type: "finishAnswer" });
  }

  const notices = (
    <>
      {promptTooLarge && (
        <Alert className="mx-auto w-full max-w-3xl" data-testid="system-prompt-too-large">
          <TriangleAlert />
          <AlertTitle>The instructions do not fit this assistant&apos;s context window</AlertTitle>
          <AlertDescription>
            The system prompt is about {estimateTokens(systemPrompt)} tokens, and the context window leaves {budget} for
            the prompt and the conversation (window {settings.contextWindowSize} − max tokens {settings.maxTokens}). It
            is cut to fit, so the end of the instructions is not applied. Raise the context window or shorten the
            template.
          </AlertDescription>
        </Alert>
      )}
      {configuration.templateId && !configuration.template && (
        <Alert className="mx-auto w-full max-w-3xl" data-testid="template-missing">
          <TriangleAlert />
          <AlertTitle>This assistant&apos;s template was deleted</AlertTitle>
          <AlertDescription>
            It answers with the default prompt. Pick another template in Edit assistant.
          </AlertDescription>
        </Alert>
      )}
      {tooLong && (
        <Alert variant="destructive" className="mx-auto w-full max-w-3xl" data-testid="message-too-long">
          <CircleAlert />
          <AlertTitle>The message is too long for this assistant</AlertTitle>
          <AlertDescription>{tooLong}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mx-auto w-full max-w-3xl">
          <CircleAlert />
          <AlertTitle>The answer could not be generated</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {contextNote.dropped > 0 && (
        <p className="mx-auto w-full max-w-3xl text-xs text-muted-foreground" data-testid="context-note">
          The {contextNote.dropped} earliest{" "}
          {contextNote.dropped === 1 ? "message no longer fits" : "messages no longer fit"} in the context window: the
          assistant does not see {contextNote.dropped === 1 ? "it" : "them"} any more.
        </p>
      )}
    </>
  );

  const input = (
    <ChatInput
      value={draft}
      onChange={value => {
        setDraft(value);
        setTooLong(null);
      }}
      onSend={() => void handleSend()}
      onStop={stop}
      isAnswering={isAnswering}
    />
  );

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <EmptyState configuration={configuration} onSuggestion={setDraft} />
        <div className="flex w-full max-w-3xl flex-col gap-3">
          {notices}
          {input}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList messages={messages} userInitials={initials(userName)} isAnswering={state.isAnswering} />
      <div className="flex flex-col gap-3 border-t p-4">
        {notices}
        {input}
      </div>
    </div>
  );
}
