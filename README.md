# myassistant-web

The web client of **MyAssistant**: React + TypeScript + Vite, served by nginx in Docker. It runs a Large Language Model in the browser with WebLLM (WebGPU) and manages the user's assistants and prompt templates through the MyAssistant API.

- What is built and what is in scope now: [`docs/requirements.md`](../docs/requirements.md) in the wrapper repository `myassistant` (the source of truth).
- Architecture and endpoints: [`docs/architecture.md`](../docs/architecture.md) in the wrapper.
- Conventions for humans and coding agents: [`AGENTS.md`](AGENTS.md) (`CLAUDE.md` is generated from it with `sh scripts/sync-agent-instructions.sh`).

The two `../docs/...` links are relative to the layout `make bootstrap` creates (this repository cloned inside the wrapper `myassistant`). Viewed on its own, for example on a Git host, open the same paths in the `myassistant` wrapper repository.

Requires a WebGPU-capable browser (recent desktop Chrome or Edge). This repository is cloned next to the wrapper's `Makefile` by `make bootstrap`; run it with `make up` from the wrapper.

## Scripts

| Command                                   | What it does                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                             | Vite dev server on `http://localhost:5173` (`/api` proxied to `:8080`) |
| `npm run build`                           | Type-check (`tsc -b`) and build into `dist/`                           |
| `npm run preview`                         | Serve the built `dist/` locally                                        |
| `npm run lint`                            | ESLint                                                                 |
| `npm run format` / `npm run format:check` | Prettier (write / check only, as in CI)                                |
| `npm test` (`npm test -- --run` in CI)    | Vitest (watch mode / single run)                                       |
