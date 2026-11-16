import { Sparkles } from "lucide-react";

// The chat area of the layout. Messages, the composer and the model loader arrive with WebLLM (Phase 8),
// and `:configId` selects the assistant once assistants can be loaded (Phase 10).
export function ChatPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <Sparkles className="size-8 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Chat</h1>
      <p className="text-muted-foreground">Pick an assistant in the sidebar to start a conversation.</p>
    </div>
  );
}
