import { useEffect, useReducer, useState } from "react";
import { useLocation } from "react-router";
import { CircleAlert } from "lucide-react";

import { ChatInput } from "@/components/chat/ChatInput";
import { EmptyState } from "@/components/chat/EmptyState";
import { MessageList } from "@/components/chat/MessageList";
import { ModelLoader } from "@/components/chat/ModelLoader";
import { chatReducer, historyForModel, initialChatState, visibleMessages } from "@/components/chat/chatState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useEngine, type UseEngine } from "@/hooks/useEngine";
import { useAuthStore } from "@/store/useAuthStore";

// Hard-coded until assistants are loaded into the chat (Phase 10): the smallest chat model, ~1 GB of GPU memory.
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const SYSTEM_PROMPT = "You are a helpful assistant.";

function initials(name: string | undefined): string {
  const letters = (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "You";
}

// Chat owns the model (load, progress, load errors); Conversation owns the messages. They are split so that
// "New chat" can start an empty conversation (a new key) without touching the model already loaded.
export function Chat() {
  const engine = useEngine();
  const { load, status, progress, error } = engine;
  const location = useLocation();

  useEffect(() => {
    void load(MODEL_ID);
  }, [load]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ModelLoader modelId={MODEL_ID} progress={progress} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-xl">
          <CircleAlert />
          <AlertTitle>The model could not be loaded</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load(MODEL_ID)}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // location.key changes on every navigation, also to the same URL, which is what the sidebar's "New chat" does.
  return <Conversation key={location.key} engine={engine} />;
}

function Conversation({ engine }: { engine: UseEngine }) {
  const { send, stop, status, error } = engine;
  const [state, dispatch] = useReducer(chatReducer, SYSTEM_PROMPT, initialChatState);
  const [draft, setDraft] = useState("");
  const userName = useAuthStore(store => store.user?.displayName);
  const messages = visibleMessages(state);
  // An answer from a conversation just left with "New chat" may still be ending in the engine.
  const isAnswering = state.isAnswering || status === "generating";

  // Leaving the page (or starting a new chat) must not leave the GPU busy with an answer nobody will see.
  useEffect(() => () => stop(), [stop]);

  async function handleSend() {
    const action = { type: "send", text: draft } as const;
    const next = chatReducer(state, action);
    if (next === state || isAnswering) return;
    dispatch(action);
    setDraft("");
    await send(historyForModel(next), text => dispatch({ type: "appendAnswer", text }));
    dispatch({ type: "finishAnswer" });
  }

  const errorBanner = error && (
    <Alert variant="destructive" className="mx-auto w-full max-w-3xl">
      <CircleAlert />
      <AlertTitle>The answer could not be generated</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  const input = (
    <ChatInput
      value={draft}
      onChange={setDraft}
      onSend={() => void handleSend()}
      onStop={stop}
      isAnswering={isAnswering}
    />
  );

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <EmptyState modelId={MODEL_ID} onSuggestion={setDraft} />
        <div className="flex w-full max-w-3xl flex-col gap-3">
          {errorBanner}
          {input}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList messages={messages} userInitials={initials(userName)} isAnswering={state.isAnswering} />
      <div className="flex flex-col gap-3 border-t p-4">
        {errorBanner}
        {input}
      </div>
    </div>
  );
}
