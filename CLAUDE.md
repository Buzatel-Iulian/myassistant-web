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
- When a decision changes, update `docs/requirements.md` **in the same step** as the code. A deferred requirement is moved (to a later phase, *Later* or *Non-goals*), never silently dropped.
- **One new concept per phase.** Do not implement future phases in advance, and do not add libraries, abstractions or configuration a later phase will need.

## 2. Code rules

- **TypeScript strict, no `any`.** Data coming from the API is typed in `src/lib/types.ts`; **the API is the source of truth for its shapes.**
- **Only `src/lib/api/client.ts` calls `fetch`.** It adds the token, parses `ProblemDetail` errors into a typed `ApiError`, and on 401 logs out. Feature modules (`lib/api/templates.ts`, ...) are typed wrappers over it.
- **Only `src/lib/llm/engine.ts` talks to WebLLM** (the engine runs in `lib/llm/worker.ts`). Components use the `useEngine()` hook.
- **Only `src/lib/llm/prompt.ts` builds the system prompt.** No other place concatenates prompt text. Variable values are untrusted text: single pass, no recursion, trimmed and capped.
- **One owner per piece of data:** chat messages belong to the chat component/hook. The Zustand store holds the token, the active assistant id and UI preferences — **never messages or copies of server data.**
- **New UI components come from the shadcn CLI** (`npx shadcn@latest add ...`); `src/components/ui/` is generated and not edited by hand. **Icons only from `lucide-react`.**
- Use the `@/*` import alias. Folder layout: `pages/`, `components/` (`ui/`, `layout/`, `chat/`, `assistants/`, `templates/`, `settings/`), `lib/` (`api/`, `llm/`, `types.ts`), `store/`, `hooks/`.
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
