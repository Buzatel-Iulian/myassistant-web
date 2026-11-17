import { SidebarTrigger } from "@/components/ui/sidebar";

interface AppHeaderProps {
  /** Receives the element pages fill through `HeaderContent` (the chat puts its assistant there). */
  slotRef: (element: HTMLElement | null) => void;
}

// Almost empty on purpose, as in SkillForge: the trigger is what a small screen needs to reach the sidebar. The chat
// adds the active assistant's name, model and "Edit assistant" through the slot.
export function AppHeader({ slotRef }: AppHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      {/* The app name shows only while no page fills the slot (`peer-empty`); the slot comes first in the markup for
          the peer selector and is moved after the name with `order`. */}
      <div ref={slotRef} className="peer order-2 flex min-w-0 flex-1 items-center gap-2 empty:hidden" />
      <span className="order-1 hidden truncate text-sm font-medium peer-empty:block">MyAssistant</span>
    </header>
  );
}
