import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingPage({ label }: { label: string }) {
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
