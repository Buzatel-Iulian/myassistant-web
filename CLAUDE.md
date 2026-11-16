<!--
  AUTO-GENERATED FILE — DO NOT EDIT.
  Source: AGENTS.md
  Regenerate: sh scripts/sync-agent-instructions.sh
-->

# Agent instructions — MyAssistant Web

`myassistant-web` is the web client of MyAssistant: a React 19 + TypeScript single-page application built with Vite and served by nginx in Docker. It runs a Large Language Model **in the browser** with WebLLM (`@mlc-ai/web-llm`) on WebGPU, in a Web Worker, and talks to the MyAssistant API (`/api`) to manage the user's account, prompt templates and assistants (LLM configurations).

This project is built **step by step, in phases**. Read the rules below before proposing or writing anything.

## 1. Requirements are the single source of truth

- **`docs/requirements.md` in the wrapper repository (`myassistant`) is the single source of truth.** It defines the phases, what is in scope now and what is deferred. `docs/architecture.md` there holds the data model and the endpoint table.
- If a conversation conflicts with `docs/requirements.md`, **the file wins** until it is updated.
- When a decision changes, update `docs/requirements.md` **in the same step** as the code. A deferred requirement is moved (to a later phase, _Later_ or _Non-goals_), never silently dropped.
- **One new concept per phase.** Do not implement future phases in advance, and do not add libraries, abstractions or configuration a later phase will need.

## 2. Code rules

- **TypeScript strict, no `any`.** Data coming from the API is typed in `src/lib/types.ts`; **the API is the source of truth for its shapes.**
- **Only `src/lib/api/client.ts` calls `fetch`.** It adds the token, parses `ProblemDetail` errors into a typed `ApiError`, and on 401 logs out. Feature modules (`lib/api/templates.ts`, ...) are typed wrappers over it.
- **Only `src/lib/llm/engine.ts` talks to WebLLM** (the engine runs in `lib/llm/worker.ts`). Components use the `useEngine()` hook and the app's own types from `engine.ts` (`ChatMessage`, `LoadProgress`), never WebLLM's types.
  - One engine for the whole app; loads go through its queue (same model = instant, same model loading = shared, another model = after the current load). WebLLM is imported dynamically there, so keep it out of every other import: a static import would put ~6 MB back into the main bundle.
  - The worker is created with `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` and bundled as an ES module (`worker.format: "es"` in `vite.config.ts`).
  - Chat messages are the chat component's state (`components/chat/chatState.ts` reducer), in the OpenAI format `{ role, content }` with the system prompt first.
- **Only `src/lib/llm/prompt.ts` builds the system prompt.** No other place concatenates prompt text. Variable values are untrusted text: single pass, no recursion, trimmed and capped.
- **One owner per piece of data:** chat messages belong to the chat component/hook. The Zustand store holds the token (with its expiry and the logged-in user from `/api/users/me`), the active assistant id and UI preferences — **never messages or copies of server data.** Server lists (assistants, templates) are fetched by a hook or component (`hooks/useConfigurations.ts`) and live in its state.
- **Auth:** `useAuthStore` (`sessionStorage`, key `myassistant-auth`) is the only place that holds the session; an expired `expiresAt` is a logged-out session. Protected routes sit under `RequireAuth`, which redirects a logged-out visitor to `/login`; the client only logs out on a 401 and lets `RequireAuth` do the redirect. Read persisted state behind `useHydrated()`.
- **New UI components come from the shadcn CLI** (`npx shadcn@latest add ...`, style `base-nova` on Base UI, see `components.json`); `src/components/ui/` is generated and not edited by hand. **Icons only from `lucide-react`.**
  - Run `npm run format` after `shadcn add`: the generated files are formatted and linted like the rest of the code (as in SkillForge).
  - The only hand edits to generated files, both ported from SkillForge: `ui/sonner.tsx` takes its theme from `useResolvedTheme()` instead of `next-themes` (one theme system), and `hooks/use-mobile.ts` uses `useSyncExternalStore` (the generated version breaks `react-hooks/set-state-in-effect`). Re-apply them if a re-add overwrites these files.
  - ESLint turns off `react-refresh/only-export-components` for `src/components/ui/**` only (shadcn exports `buttonVariants`, `useSidebar`, ... next to the components). Unused locals are an ESLint error, not a `tsc` one (`noUnusedLocals` is off because shadcn generates an unused `import * as React`).
- Use the `@/*` import alias. Folder layout: `pages/`, `components/` (`ui/`, `layout/`, `auth/`, `chat/`, `assistants/`, `templates/`, `settings/`), `lib/` (`api/`, `llm/`, `types.ts`), `store/`, `hooks/`. Create a folder when the first file needs it.
- File names: components and pages in PascalCase (`AppSidebar.tsx`, `ChatPage.tsx`), hooks and stores as `useXxx.ts`; shadcn-generated files keep their kebab-case names.
- **Theme:** `useAppStore.theme` (`system | light | dark`, persisted in `localStorage`) is written only by the settings dialog; everything that draws reads `useResolvedTheme()` (`light | dark`). `ThemeProvider` puts the `dark` class on `<html>`.
- **Tests:** Vitest, `*.test.ts(x)` next to the code. The default environment is Node; a test that needs the DOM or `localStorage` starts with `// @vitest-environment jsdom`.
- Comments explain **why**, never what.
- **Run `npm run format` before considering a step done** (`npm run format:check` is the CI variant), together with `npm run lint`, `npm test -- --run` and `npm run build`.

## 3. Secrets and privacy

- The frontend holds **no secret**: no API keys, no JWT signing key. The only credential is the user's own login token, kept in `sessionStorage`.
- **Prompts and answers never leave the browser.** Never send conversation content to the API or any other server.
- Browsers without WebGPU get an explanatory message, never a broken page.

## 4. External integrations

Every external integration (WebLLM, ...) is documented in the wrapper's `docs/<integration>/README.md`, from `docs/_template/README.md`, in the same step that adds it.

## 5. Language and commits

- Code, identifiers, comments, UI copy, docs and commit messages are in **English**.
- Do not commit anything unless the user asks.

## 6. These instruction files are generated

`AGENTS.md` is the canonical file. `CLAUDE.md` and `.github/copilot-instructions.md` are **generated copies** — do not edit them.

To change conventions: edit `AGENTS.md`, then run

```sh
sh scripts/sync-agent-instructions.sh
```

`sh scripts/sync-agent-instructions.sh --check` verifies the copies are in sync and exits non-zero if they are not.
