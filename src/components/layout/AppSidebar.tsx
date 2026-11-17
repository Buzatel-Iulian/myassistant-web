import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Bot, ChevronUp, FileText, Plus, Star } from "lucide-react";

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
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfigurations } from "@/hooks/useConfigurations";
import { useAuthStore } from "@/store/useAuthStore";

const LIBRARY_LINKS = [
  { to: "/assistants", label: "Assistants", icon: Bot },
  { to: "/templates", label: "Templates", icon: FileText }
] as const;

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

// On a phone the sidebar is a sheet over the page: after picking a destination the user wants to see it, not the
// menu (QA-6-1). On desktop `openMobile` is unused, so this does nothing there.
function useCloseOnMobile() {
  const { setOpenMobile } = useSidebar();
  return () => setOpenMobile(false);
}

function AssistantsList() {
  const { pathname } = useLocation();
  const closeOnMobile = useCloseOnMobile();
  const result = useConfigurations();

  if (result.status === "loading") {
    return (
      <SidebarMenu aria-busy="true" aria-label="Loading assistants">
        <SidebarMenuSkeleton showIcon />
        <SidebarMenuSkeleton showIcon />
      </SidebarMenu>
    );
  }
  if (result.status === "error") {
    return <p className="px-2 py-1.5 text-sm text-destructive">{result.message}</p>;
  }
  if (result.data.length === 0) {
    return <p className="px-2 py-1.5 text-sm text-muted-foreground">No assistants yet.</p>;
  }
  return (
    <SidebarMenu>
      {result.data.map(configuration => {
        const to = `/chat/${configuration.id}`;
        return (
          <SidebarMenuItem key={configuration.id}>
            <SidebarMenuButton render={<Link to={to} />} isActive={pathname === to} onClick={closeOnMobile}>
              <Bot />
              <span className="truncate">{configuration.name}</span>
              {configuration.favorite && (
                <Star className="ml-auto fill-current text-amber-500" aria-label="Favorite" role="img" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

// SkillForge's sidebar, with the user's assistants where SkillForge lists conversations: in MyAssistant you pick
// an assistant and chat with it, and conversations are not stored.
export function AppSidebar() {
  const { pathname } = useLocation();
  const closeOnMobile = useCloseOnMobile();
  const user = useAuthStore(state => state.user);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to="/chat" />} onClick={closeOnMobile}>
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
                <AssistantsList />
              </ScrollArea>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Library</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {LIBRARY_LINKS.map(link => (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton
                      render={<Link to={link.to} />}
                      isActive={pathname.startsWith(link.to)}
                      onClick={closeOnMobile}
                    >
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
              {/* The name comes from /api/users/me, loaded by RequireAuth after login. */}
              <SidebarMenuButton size="lg" onClick={() => setSettingsOpen(true)}>
                <Avatar className="size-6">
                  <AvatarFallback>{user ? initials(user.displayName) : ""}</AvatarFallback>
                </Avatar>
                {user ? (
                  <span className="truncate">{user.displayName}</span>
                ) : (
                  <Skeleton className="h-4 w-24" aria-label="Loading your name" />
                )}
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
