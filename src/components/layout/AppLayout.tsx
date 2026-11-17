import { useState } from "react";
import { Outlet } from "react-router";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { HeaderSlotContext } from "@/components/layout/headerSlot";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppLayout() {
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* The window height is the limit and the content area scrolls under the header, so the chat composer stays
          at the bottom of the screen while the message list scrolls. */}
      <SidebarInset className="h-svh">
        <AppHeader slotRef={setHeaderSlot} />
        <HeaderSlotContext.Provider value={headerSlot}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Outlet />
          </div>
        </HeaderSlotContext.Provider>
      </SidebarInset>
    </SidebarProvider>
  );
}
