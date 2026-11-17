import { RefreshCw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// A 409 on save: someone saved this item after it was opened (another tab). Reloading shows their version and drops
// the unsaved edits here, so it is the user's choice, not automatic.
export function StaleVersionAlert({ what, onReload }: { what: "assistant" | "template"; onReload: () => void }) {
  return (
    <Alert variant="destructive" data-testid="stale-version">
      <TriangleAlert />
      <AlertTitle>This {what} was changed in another tab. Reload?</AlertTitle>
      <AlertDescription>
        <p>Reloading shows the saved version; your unsaved changes here are lost.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onReload}>
          <RefreshCw /> Reload
        </Button>
      </AlertDescription>
    </Alert>
  );
}
