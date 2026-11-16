import { CircleAlert } from "lucide-react";

import { Chat } from "@/components/chat/Chat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebGpuSupport } from "@/hooks/useWebGpuSupport";

// `:configId` selects the assistant once assistants can be loaded into the chat (Phase 10); for now every chat uses
// the same hard-coded model and system prompt.
export function ChatPage() {
  const webGpu = useWebGpuSupport();

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

  return <Chat />;
}
