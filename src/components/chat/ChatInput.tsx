import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** True while an answer is being generated: the button becomes Stop. */
  isAnswering: boolean;
  /** True while the model cannot take a message yet (still loading). */
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, onStop, isAnswering, disabled = false }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !isAnswering && value.trim().length > 0;

  // The height follows the text by hand: a <textarea> does not grow with its content. Done on every value change,
  // not only on typing, so the box also shrinks back when it is cleared after sending or filled by a suggestion.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleSend() {
    if (!canSend) return;
    onSend();
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends and Shift+Enter starts a new line, as in every chat app.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "The model is loading…" : "Message the assistant…"}
        aria-label="Message"
        rows={1}
        className="max-h-52 min-h-10 resize-none border-none shadow-none focus-visible:ring-0"
      />
      {isAnswering ? (
        <Button size="icon-sm" onClick={onStop} aria-label="Stop generating" title="Stop">
          <Square />
        </Button>
      ) : (
        <Button size="icon-sm" onClick={handleSend} disabled={!canSend} aria-label="Send message" title="Send">
          <Send />
        </Button>
      )}
    </div>
  );
}
