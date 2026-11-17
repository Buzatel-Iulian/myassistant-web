import { useEffect } from "react";
import { useRouteError } from "react-router";
import { CircleAlert, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// What a page that failed to load or crashed shows instead of React Router's developer screen (which prints the stack
// trace). The usual cause is a page chunk that could not be downloaded (the web server was restarted with a new build,
// or the network dropped), which a reload fixes.
export function RouteError() {
  const error = useRouteError();

  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Alert variant="destructive" className="max-w-xl" data-testid="route-error">
        <CircleAlert />
        <AlertTitle>This page could not be shown</AlertTitle>
        <AlertDescription>
          <p>
            Part of the app could not be loaded, or something unexpected went wrong. Check that MyAssistant is still
            running, then reload the page.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
            <RefreshCw /> Reload
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
