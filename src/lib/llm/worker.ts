import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// The engine runs here, outside the main thread: model compilation and token generation would otherwise freeze the UI.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message: MessageEvent) => handler.onmessage(message);
