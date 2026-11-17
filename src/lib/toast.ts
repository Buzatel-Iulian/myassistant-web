import { toast as sonner, type ExternalToast } from "sonner";

// The app's toasts are short confirmations that close by themselves. Sonner remembers which element had the focus
// when the keyboard moves into a dismissible toast and puts the focus back there when it leaves, so with a toast on
// screen Tab bounced between the toast and the chat composer (QA-11-1). A non-dismissible toast skips that focus
// return (it still closes after its duration); swiping it away is what is given up. Import `toast` from here, not
// from "sonner".
const OPTIONS: ExternalToast = { dismissible: false };

export const toast = {
  success: (message: string) => sonner.success(message, OPTIONS),
  error: (message: string) => sonner.error(message, OPTIONS)
};
