import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Bot, ChevronUp, FileText, Plus } from "lucide-react";

import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";

const LIBRARY_LINKS = [
  { to: "/assistants", label: "Assistants", icon: Bot },
  { to: "/templates", label: "Templates", icon: FileText }
] as const;

// SkillForge's sidebar, with the user's assistants where SkillForge lists conversations: in MyAssistant you pick
// an assistant and chat with it, and conversations are not stored.
export function AppSidebar() {
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to="/chat" />}>
                <Plus />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="min-h-0 flex-1">
            <SidebarGroupLabel>Assistants</SidebarGroupLabel>
            <SidebarGroupContent className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                {/* Filled from the API once the user can log in (Phase 7). */}
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No assistants yet.</p>
              </ScrollArea>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Library</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {LIBRARY_LINKS.map(link => (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton render={<Link to={link.to} />} isActive={pathname.startsWith(link.to)}>
                      <link.icon />
                      <span>{link.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => setSettingsOpen(true)}>
                <Avatar className="size-6">
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
                <span className="truncate">Guest</span>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
