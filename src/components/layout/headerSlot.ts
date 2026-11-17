import { createContext, useContext } from "react";

// The header belongs to the layout, but what it shows about the page (the chat's assistant) belongs to the page.
// The layout hands its header area to the page through this context, and the page portals into it: the assistant
// is then shown from the one object the chat loaded, with no second fetch and no copy in a store.
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

export function useHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlotContext);
}
