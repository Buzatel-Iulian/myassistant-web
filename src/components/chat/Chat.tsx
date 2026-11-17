import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { AssistantHeader } from "@/components/chat/AssistantHeader";
import { EngineErrorAlert } from "@/components/chat/EngineErrorAlert";
import { ChatInput } from "@/components/chat/ChatInput";
import { EmptyState } from "@/components/chat/EmptyState";
import { LoadConfirmation } from "@/components/chat/LoadConfirmation";
import { MessageList } from "@/components/chat/MessageList";
import { ModelLoader } from "@/components/chat/ModelLoader";
import { visibleMessages } from "@/components/chat/chatState";
import { canRetryAlone } from "@/components/chat/loadPlan";
import { LoadingPage } from "@/components/common/PageState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useModel } from "@/hooks/useModel";
import { getConfiguration } from "@/lib/api/configurations";
import { contextBudget, estimateTokens, systemPromptFits } from "@/lib/llm/context";
import type { ModelKey } from "@/lib/llm/engine";
import { systemPromptFor } from "@/lib/llm/prompt";
import { toChatOptions, type ChatOptions } from "@/lib/llm/settings";
import type { Configuration } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { EMPTY_CONVERSATION, useConversationStore } from "@/store/useConversationStore";

// One wording for "this message does not fit", whether the estimate saw it before sending or WebLLM refused it
// (QA-10-1: text denser than the estimate, with no history left to drop).
const SHORTEN_HINT = "Shorten it, or raise the context window in Edit assistant.";

// The chat fetches its assistant when it opens, so an edit made meanwhile (another model, window or prompt) applies
// when the user comes back; nothing else changes it under an open chat.
const NO_CHANGES = [] as const;

// The sidebar's "New chat" travels in the navigation's state (through `/chat`, which picks the assistant).
function isNewChatRequest(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as { newChat?: unknown }).newChat === true;
}

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
 * The chat with one saved assistant (`/chat/:configId`), mounted once per assistant (keyed by its id). What outlives
 * it is kept outside: the model stays resident in the engine registry and the conversation in the conversation store,
 * so coming back to an assistant shows its conversation at once, with no load if its model is still in GPU memory.
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
    else if (notFound) {
      if (useAppStore.getState().activeConfigurationId === configId) setActiveConfigurationId(null);
      useConversationStore.getState().drop(configId);
    }
  }, [openedId, notFound, configId, setActiveConfigurationId]);

  // The local API answers in a few milliseconds: coming back to a chat must not flash a skeleton for that.
  if (loaded.status === "loading") return <LoadingPage label="Loading assistant" delayMs={400} />;

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

// Owns the model's state on screen (confirmation, loader, load errors, the header's Reload/Unload); Conversation shows
// the messages, which live in the conversation store.
function LoadedAssistant({ configuration }: { configuration: Configuration }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { id, modelId } = configuration;
  const options = useMemo(() => toChatOptions(configuration.settings), [configuration.settings]);
  const systemPrompt = useMemo(() => systemPromptFor(configuration), [configuration]);
  const model = useModel(modelId, options.load);
  const { view, progress, error, residents, load, reload, unload } = model;
  const conversation = useConversationStore(state => state.conversations[id]) ?? EMPTY_CONVERSATION;
  const keptMessages = visibleMessages(conversation.chat).length;

  // "New chat" empties this assistant's conversation once per navigation (location.key), before the first paint, so
  // the previous conversation does not flash; Back to that history entry later does not empty it again.
  const newChatRequested = isNewChatRequest(location.state);
  useLayoutEffect(() => {
    if (newChatRequested && conversation.startedBy !== location.key) {
      useConversationStore.getState().newChat(id, location.key);
    }
  }, [newChatRequested, conversation.startedBy, location.key, id]);

  // Back goes where the user came from in the app; the first page of the tab (a link, the page after login) has nothing
  // before it in the app, so it goes to the assistants. `idx` is React Router's position in its own history.
  const goBack = () => {
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    void (typeof index === "number" && index > 0 ? navigate(-1) : navigate("/assistants"));
  };

  let body: React.ReactNode;
  if (view === "loading") {
    body = (
      <Centered>
        <ModelLoader modelId={modelId} progress={progress} />
      </Centered>
    );
  } else if (view === "error" && error) {
    body = (
      <Centered>
        <EngineErrorAlert
          failure={error}
          modelId={modelId}
          className="max-w-xl"
          actions={
            <>
              {canRetryAlone(error, model.key, residents) && (
                <Button variant="outline" size="sm" onClick={() => void load("replace")}>
                  Unload other models and try again
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void load("alongside")}>
                Try again
              </Button>
              <Button variant="outline" size="sm" render={<Link to={`/assistants/${configuration.id}`} />}>
                Edit assistant
              </Button>
            </>
          }
        />
      </Centered>
    );
  } else if (view === "confirm") {
    body = (
      <Centered>
        <LoadConfirmation
          modelId={modelId}
          modelKey={model.key}
          contextWindowSize={configuration.settings.contextWindowSize}
          residents={residents}
          keptMessages={keptMessages}
          onLoad={mode => void load(mode)}
          onBack={goBack}
        />
      </Centered>
    );
  } else {
    body = (
      <Conversation configuration={configuration} systemPrompt={systemPrompt} options={options} modelKey={model.key} />
    );
  }

  return (
    <>
      <AssistantHeader
        configuration={configuration}
        model={{
          view,
          residentCount: residents.length,
          answering: conversation.chat.isAnswering,
          onReload: () => void reload(),
          onUnload: () => void unload()
        }}
      />
      {body}
    </>
  );
}

interface ConversationProps {
  configuration: Configuration;
  systemPrompt: string;
  options: ChatOptions;
  modelKey: ModelKey;
}

function Conversation({ configuration, systemPrompt, options, modelKey }: ConversationProps) {
  const { id, settings } = configuration;
  const conversation = useConversationStore(state => state.conversations[id]) ?? EMPTY_CONVERSATION;
  const send = useConversationStore(state => state.send);
  const stopAnswer = useConversationStore(state => state.stop);
  const { chat, contextNote, error } = conversation;
  const [draft, setDraft] = useState("");
  const [tooLong, setTooLong] = useState<string | null>(null);
  const userName = useAuthStore(store => store.user?.displayName);
  const messages = visibleMessages(chat);
  const isAnswering = chat.isAnswering;
  const budget = contextBudget(settings);
  const promptTooLarge = !systemPromptFits(systemPrompt, settings) || contextNote.systemPromptTruncated;

  // Leaving the chat does not stop its answer any more (Phase 12): it keeps streaming into the conversation store.

  async function handleSend() {
    const text = draft;
    const outcome = send(id, { text, systemPrompt, settings, params: options.request, modelKey });
    if (outcome.status === "ignored") return;
    if (outcome.status === "tooLong") {
      setTooLong(
        `This message is about ${outcome.messageTokens} tokens, and at most ${outcome.budget} fit in this assistant's ` +
          `context window next to its answer. ${SHORTEN_HINT}`
      );
      return;
    }
    setTooLong(null);
    setDraft("");
    if ((await outcome.answer) === "overflow") {
      // Refused before the first token: the message goes back to the composer to be shortened.
      setDraft(current => current || text);
      setTooLong(
        `This message has more tokens than the estimate allowed for, and it does not fit in this assistant's context window next to its answer. ${SHORTEN_HINT}`
      );
    }
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
        <EngineErrorAlert failure={error} modelId={configuration.modelId} className="mx-auto w-full max-w-3xl" />
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
      onStop={() => stopAnswer(id)}
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
      <MessageList messages={messages} userInitials={initials(userName)} isAnswering={isAnswering} />
      <div className="flex flex-col gap-3 border-t p-4">
        {notices}
        {input}
      </div>
    </div>
  );
}
