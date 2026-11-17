import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useHeaderSlot } from "@/components/layout/headerSlot";

/** Shows `children` in the app header for as long as the calling page is mounted. */
export function HeaderContent({ children }: { children: ReactNode }) {
  const slot = useHeaderSlot();
  return slot ? createPortal(children, slot) : null;
}
