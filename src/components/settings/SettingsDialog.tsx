import { useState } from "react";
import { HardDrive, LogOut, Monitor, Moon, Palette, Sun, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "@/lib/toast";

import { ModelCacheSection } from "@/components/settings/ModelCacheSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Theme } from "@/lib/theme";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon }
];

// The only place that writes the theme: a second switch (in the header, say) would be a second source that can
// disagree with this one.
function AppearanceSection() {
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Appearance</h2>
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Theme</h3>
          <p className="text-sm text-muted-foreground">Choose how MyAssistant looks on this device.</p>
        </div>
        <div role="group" aria-label="Theme" className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map(option => (
            <Button
              key={option.value}
              variant={option.value === theme ? "secondary" : "outline"}
              aria-pressed={option.value === theme}
              onClick={() => setTheme(option.value)}
            >
              <option.icon />
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The settings' home of the account. Logging out navigates by itself: RequireAuth sends a logged-out visitor to
// /login, which also closes this dialog with the layout.
function AccountSection() {
  const user = useAuthStore(state => state.user);

  function handleLogout() {
    useAuthStore.getState().logout();
    toast.success("You are logged out.");
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Account</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="truncate">{user?.displayName ?? "…"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate">{user?.email ?? "…"}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        You stay logged in in this tab until you close it, log out, or the login expires.
      </p>
      <div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut />
          Log out
        </Button>
      </div>
    </div>
  );
}

// A list, not a switch on the section id: a new section is a new row here.
const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette, Content: AppearanceSection },
  { id: "model-cache", label: "Model cache", icon: HardDrive, Content: ModelCacheSection },
  { id: "account", label: "Account", icon: UserRound, Content: AccountSection }
] as const;

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// A dialog over the current page, not a settings route: changing the theme has nothing to do with the open chat,
// and a page that replaced the chat would lose the context the user came from.
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]["id"]>("appearance");
  const ActiveContent = SECTIONS.find(section => section.id === activeSection)?.Content ?? AppearanceSection;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Two panes from the small breakpoint up (SkillForge); on a phone the sections become a row of tabs above the
          content, so the content keeps the whole width. */}
      <DialogContent className="flex h-[min(32rem,90vh)] flex-col gap-0 p-0 sm:max-w-3xl sm:flex-row">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">MyAssistant preferences on this device.</DialogDescription>

        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/40 p-2 pr-12 sm:w-56 sm:flex-col sm:border-r sm:border-b-0 sm:p-3"
        >
          {SECTIONS.map(section => (
            <Button
              key={section.id}
              variant={section.id === activeSection ? "secondary" : "ghost"}
              aria-current={section.id === activeSection ? "page" : undefined}
              // On a phone the three tabs must fit next to the close button: no icons, less padding.
              className="justify-start max-sm:px-2 max-sm:[&_svg]:hidden"
              onClick={() => setActiveSection(section.id)}
            >
              <section.icon />
              {section.label}
            </Button>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:h-full sm:p-6">
          <ActiveContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}
