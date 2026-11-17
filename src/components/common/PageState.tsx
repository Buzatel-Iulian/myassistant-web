import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeletons while a page loads. With `delayMs` they appear only if the load takes longer: a fast answer then shows
 * nothing in between instead of a skeleton flash (the chat opened again, Phase 12).
 */
export function LoadingPage({ label, delayMs = 0 }: { label: string; delayMs?: number }) {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [visible, delayMs]);

  if (!visible) return <div className="flex-1" aria-busy="true" aria-label={label} />;
  return (
    <div className="flex flex-col gap-3 p-6" aria-busy="true" aria-label={label}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full max-w-3xl" />
      <Skeleton className="h-32 w-full max-w-3xl" />
    </div>
  );
}

export function LoadErrorPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <Alert variant="destructive" className="max-w-xl">
        <CircleAlert />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  );
}
