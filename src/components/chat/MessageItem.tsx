import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatMessage } from "@/lib/llm/engine";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: ChatMessage;
  userInitials: string;
  isStreaming: boolean;
}

// The copy button sits in the bubble, not at conversation level: the user always copies one message, and the toast
// confirms it without interrupting the reading.
export function MessageItem({ message, userInitials, isStreaming }: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("Message copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the message.");
    }
  }

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <Avatar className="mt-0.5 size-8 shrink-0">
        <AvatarFallback>{isUser ? userInitials : "AI"}</AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "group relative max-w-[75%] rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
        // A screen reader does not see the text growing: the live region reads the new words as they arrive.
        aria-live={isStreaming ? "polite" : undefined}
        data-role={message.role}
        data-streaming={isStreaming || undefined}
      >
        {message.content}
        {/* Until the first token the model is reading the prompt; the dots say it is working. */}
        {isStreaming && !message.content && (
          <span aria-label="The assistant is typing" className="flex items-center gap-1 py-1.5">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </span>
        )}
        {/* The cursor sits where the answer is being written right now, not in a separate bubble below it. */}
        {isStreaming && message.content && (
          <span aria-hidden className="ml-0.5 inline-block animate-pulse">
            ▍
          </span>
        )}

        {!isStreaming && message.content && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Copy message"
                  className={cn(
                    "absolute -bottom-3 bg-background opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                    isUser ? "left-1" : "right-1"
                  )}
                  onClick={handleCopy}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              }
            />
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
