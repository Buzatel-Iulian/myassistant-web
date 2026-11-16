import { SidebarTrigger } from "@/components/ui/sidebar";

// Almost empty on purpose, as in SkillForge: the trigger is what a small screen needs to reach the sidebar.
// Phase 10 adds the active assistant's name and model here.
export function AppHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <span className="truncate text-sm font-medium">MyAssistant</span>
    </header>
  );
}
