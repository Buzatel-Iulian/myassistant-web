import { Link, Navigate, useLocation, useParams } from "react-router";
import { Bot, CircleAlert, Plus } from "lucide-react";

import { AssistantChat } from "@/components/chat/Chat";
import { pickAssistant } from "@/components/chat/pickAssistant";
import { LoadErrorPage, LoadingPage } from "@/components/common/PageState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfigurations } from "@/hooks/useConfigurations";
import { useWebGpuSupport } from "@/hooks/useWebGpuSupport";
import { useAppStore } from "@/store/useAppStore";

function OpenAssistant() {
  const result = useConfigurations();
  const lastUsedId = useAppStore(state => state.activeConfigurationId);
  const location = useLocation();

  if (result.status === "loading") return <LoadingPage label="Loading your assistants" />;
  if (result.status === "error")
    return <LoadErrorPage title="Could not load your assistants" message={result.message} />;

  const assistant = pickAssistant(result.data, lastUsedId);
  if (!assistant) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        data-testid="no-assistants"
      >
        <Bot className="size-8 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">No assistant yet</h1>
        <p className="max-w-md text-muted-foreground">
          An assistant is a model, its settings and a prompt template. Create one to start chatting.
        </p>
        <Button render={<Link to="/assistants/new" />}>
          <Plus /> Create an assistant
        </Button>
      </div>
    );
  }
  // The chat stores the id it opens, so a last-used id that is no longer in the list is replaced right away. The
  // state goes along: the sidebar's "New chat" asks the chat it opens for an empty conversation.
  return <Navigate to={`/chat/${assistant.id}`} replace state={location.state} />;
}

// `/chat/:configId` chats with that assistant; `/chat` opens the one `pickAssistant` chooses.
export function ChatPage() {
  const webGpu = useWebGpuSupport();
  const { configId } = useParams();

  if (webGpu === "checking") {
    return (
      <div className="flex flex-1 items-center justify-center p-6" aria-busy="true" aria-label="Checking WebGPU">
        <Skeleton className="h-40 w-full max-w-xl rounded-2xl" />
      </div>
    );
  }

  // Without WebGPU the engine cannot start at all, so the chat is replaced by an explanation instead of failing later.
  if (webGpu === "unsupported") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Alert className="max-w-xl" data-testid="webgpu-unsupported">
          <CircleAlert />
          <AlertTitle>WebGPU is not available</AlertTitle>
          <AlertDescription>
            MyAssistant needs a browser with WebGPU: recent Chrome or Edge on desktop. The model runs on your own GPU
            through WebGPU, and this browser does not provide it (or has it turned off).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!configId) return <OpenAssistant />;
  // Keyed by the id: another assistant is another chat; its model and conversation are kept outside the component.
  return <AssistantChat key={configId} configId={configId} />;
}
