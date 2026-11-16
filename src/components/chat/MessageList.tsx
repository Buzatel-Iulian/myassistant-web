import { useEffect, useRef } from "react";

import { MessageItem } from "@/components/chat/MessageItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "@/lib/llm/engine";

interface MessageListProps {
  messages: ChatMessage[];
  userInitials: string;
  /** True while the answer is being generated (its message is the last one). */
  isAnswering: boolean;
}

// The scroll follows `messages` as a whole, not its length: while streaming the length stays the same and only the
// last message grows, and the reducer returns a new array for every piece of text.
export function MessageList({ messages, userInitials, isAnswering }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message, index) => (
          <MessageItem
            // Index keys are safe: messages are only appended, and only an empty last answer is ever removed.
            key={index}
            message={message}
            userInitials={userInitials}
            isStreaming={isAnswering && index === messages.length - 1 && message.role === "assistant"}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
