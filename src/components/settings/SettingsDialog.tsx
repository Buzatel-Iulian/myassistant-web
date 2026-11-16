import { useState } from "react";
import { Monitor, Moon, Palette, Sun, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Theme } from "@/lib/theme";
import { useAppStore } from "@/store/useAppStore";

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

// A list, not a switch on the section id: Phase 11 adds "Model cache" and "Account" as new rows here.
const SECTIONS = [{ id: "appearance", label: "Appearance", icon: Palette, Content: AppearanceSection }] as const;

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
      <DialogContent className="flex h-[min(32rem,90vh)] gap-0 p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">MyAssistant preferences on this device.</DialogDescription>

        <nav className="flex w-44 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3 sm:w-56">
          {SECTIONS.map(section => (
            <Button
              key={section.id}
              variant={section.id === activeSection ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() => setActiveSection(section.id)}
            >
              <section.icon />
              {section.label}
            </Button>
          ))}
        </nav>

        <div className="flex h-full flex-1 flex-col overflow-y-auto p-6">
          <ActiveContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}
