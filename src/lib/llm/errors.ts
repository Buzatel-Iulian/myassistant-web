import { isContextOverflow } from "@/lib/llm/context";

// What went wrong in the local model, in words the user can act on. WebLLM's own messages are written for developers
// ("ContextWindowSizeExceededError: … `sliding_window_size`", a WebGPU device-lost explanation) and a failure inside
// the worker reaches the page as a bare string, sometimes with a stack. They are sorted into the few cases a user can
// do something about; the raw cause is kept for the console and as a short "details" line, never as a stack trace.

export type EngineErrorKind =
  /** The model files could not be downloaded: offline, a blocked host, a failed request. */
  | "download"
  /** The GPU ran out of memory (WebLLM reports it as a lost WebGPU device) or the model's buffers do not fit. */
  | "gpuMemory"
  /** The GPU lacks a feature the model needs (16-bit floats), or WebGPU disappeared. */
  | "gpuUnsupported"
  /** The browser refused to store the model (disk full, storage quota). */
  | "storage"
  /** The prompt is larger than the context window (text that tokenizes worse than the estimate). */
  | "contextOverflow"
  | "other";

export interface EngineFailure {
  kind: EngineErrorKind;
  title: string;
  message: string;
  /** The first line of the original error, shortened: useful to report a problem, never a stack trace. */
  details: string | null;
}

export type EngineAction = "load" | "answer";

const MAX_DETAILS = 240;

const PATTERNS: [EngineErrorKind, RegExp][] = [
  ["contextOverflow", /ContextWindowSizeExceeded|exceed context window size/i],
  [
    "gpuMemory",
    /DeviceLostError|device was lost|device is lost|out of memory|\bOOM\b|GPUOutOfMemoryError|Failed to allocate|maxStorageBufferBindingSize|createBuffer/i
  ],
  ["gpuUnsupported", /ShaderF16SupportError|shader-f16|WebGPUNotAvailableError|WebGPUNotFoundError|navigator\.gpu/i],
  ["storage", /QuotaExceededError|quota|no space left|not enough space/i],
  [
    "download",
    /Failed to fetch|NetworkError|network error|Load failed|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_FAILED|Cache\.add|Request failed|Cannot fetch|fetch dynamically imported module|Importing a module script failed|status code 4\d\d|status code 5\d\d/i
  ]
];

/** The error as one line of text: `Name: message` for an Error, the string the worker sent, or nothing. */
export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return error.name && error.name !== "Error" && !message.startsWith(error.name)
      ? `${error.name}: ${message}`
      : message;
  }
  if (typeof error === "string") return error.trim();
  return "";
}

/** The first line, without a stack, cut to a readable length. */
export function shortDetails(text: string): string | null {
  const firstLine = text
    .split("\n")
    .map(line => line.trim())
    .find(line => line && !line.startsWith("at "));
  if (!firstLine) return null;
  return firstLine.length > MAX_DETAILS ? `${firstLine.slice(0, MAX_DETAILS - 1)}…` : firstLine;
}

export function engineErrorKind(error: unknown): EngineErrorKind {
  const text = errorText(error);
  if (isContextOverflow(error)) return "contextOverflow";
  for (const [kind, pattern] of PATTERNS) if (pattern.test(text)) return kind;
  return "other";
}

const DOWNLOAD_HOSTS = "Hugging Face (huggingface.co) and GitHub (raw.githubusercontent.com)";

/**
 * Turns a failure of the local model into a title and a message the user can act on. `online` is
 * `navigator.onLine`: when the browser knows it is offline, the download message says so.
 */
export function describeEngineError(error: unknown, action: EngineAction, online = true): EngineFailure {
  const kind = engineErrorKind(error);
  const details = shortDetails(errorText(error));
  switch (kind) {
    case "download":
      return {
        kind,
        title: online ? "The model could not be downloaded" : "You are offline",
        message:
          (online ? "The download of the model files failed. Check your internet connection and try again. " : "") +
          `The first load of a model downloads it from ${DOWNLOAD_HOSTS}, so a firewall or proxy must allow them. ` +
          "A model already in the browser cache loads without a connection.",
        details
      };
    case "gpuMemory":
      return {
        kind,
        title: "Not enough GPU memory for this model",
        message:
          "The model needs more GPU memory than this device can give it. Choose a smaller model for this assistant " +
          "in Edit assistant (the ones below are made for laptops), or a smaller context window. Closing other " +
          "tabs and apps that use the GPU can also help, then try again.",
        details
      };
    case "gpuUnsupported":
      return {
        kind,
        title: "This GPU cannot run this model",
        message:
          "The model needs a GPU feature this device or browser does not offer (for example 16-bit floats, " +
          "shader-f16). Choose a model whose name contains q4f32 in Edit assistant, or use a recent desktop Chrome " +
          "or Edge.",
        details
      };
    case "storage":
      return {
        kind,
        title: "Not enough storage for the model",
        message:
          "The browser could not save the model files: the disk or the browser's storage quota is full. Delete " +
          "models you no longer use in Settings → Model cache, free some disk space, and try again.",
        details
      };
    case "contextOverflow":
      return {
        kind,
        title: "The message is too long for this assistant",
        message:
          "The message does not fit in this assistant's context window next to its answer. Shorten it, or raise " +
          "the context window in Edit assistant.",
        details
      };
    default:
      return {
        kind,
        title: action === "load" ? "The model could not be loaded" : "The answer could not be generated",
        message:
          action === "load"
            ? "Something went wrong while starting the local model. Try again; if it keeps failing, reload the page."
            : "Something went wrong in the local model. You can send the message again.",
        details
      };
  }
}

// A failure inside the worker crosses to the page as a plain string ("TypeError: Failed to fetch"), not an Error
// (QA-8-1). The raw value goes to the console so it can be diagnosed; the user gets what it means and what to do.
// Not pure like the rest of this file (it logs and reads navigator.onLine): the one place both the model hook and the
// conversation store turn a thrown value into an EngineFailure.
export function toFailure(error: unknown, action: EngineAction): EngineFailure {
  console.error(`Local model error (${action}):`, error);
  return describeEngineError(error, action, typeof navigator === "undefined" ? true : navigator.onLine);
}
