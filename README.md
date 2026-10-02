# Magica Frontend

A clone of the logged-in app at [magica.com](https://magica.com): a chat with an AI agent that streams its replies, its steps and the pictures it makes. It is one of two repos:

- **This repo**: the UI (Next.js, port 3001)
- **magica-backend**: the API, the agent and PostgreSQL (port 3000)

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # then fill in the Clerk keys
pnpm dev                           # http://localhost:3001
```

- **Clerk keys are required**, even in mock mode, because sign-in always goes through Clerk. A development instance works; the console notice about development keys is expected. In the Clerk dashboard, name the application "Magica" (the sign-in page shows it) and enable Apple sign-in, which magica's sign-in page offers.
- **The backend** must be running on `NEXT_PUBLIC_BACKEND_URL` and must allow CORS from `http://localhost:3001`, including the `Authorization` header and the `DELETE` method.
- **Without a backend**, set `NEXT_PUBLIC_API_MOCKING=true` and restart `pnpm dev`. Every backend call is then answered in the browser by the mocks in `tests/mocks`:
  - there are a few ready-made tasks, including a 240-message one;
  - runs take 4 seconds and are followed by polling;
  - a message asking for an image gets a picture back;
  - the mock data survives a reload.
- **Mock mode is for development only.** A production build ignores the flag unless `ALLOW_MOCKS_IN_BUILD=true` is also set when building, so a stray line in `.env.local` can't ship fake data.

## Scripts

```bash
pnpm dev              # dev server on :3001
pnpm build            # production build (runs contracts:check first)
pnpm start            # serve the build on :3001
pnpm typecheck        # route types + tsc
pnpm lint             # eslint
pnpm test             # Vitest unit + integration tests (MSW, no network)
pnpm test:e2e         # Playwright (auth redirects; needs the Clerk keys)
pnpm contracts:check  # verify the synced contracts haven't been edited
```

## Contracts

The API contracts (Zod schemas, plus `fold.ts`) are owned by the backend and **pushed** into this repo. Nothing here creates or edits them.

To update them, run this in the **backend** repo:

```bash
cd ../magica-backend
pnpm contracts:sync        # set FRONTEND_REPO_PATH if this repo is not next to it
```

then check the result here:

```bash
pnpm contracts:check
```

- Never edit `contracts/*.ts` or `contracts.lock.json` by hand. `pnpm contracts:sync` in this repo only prints these instructions and copies nothing.
- `pnpm contracts:generate-lock` exists for the backend's sync to write the lock file. Never run it by hand.
- `pnpm contracts:check` fails in any of these cases:
  - a contract was edited, is missing, or is not in the lock;
  - a file lacks the `// Generated from magica-backend` header;
  - a file has a relative import ending in `.js`. Next.js can't resolve `./x.js` to `x.ts` when building, while `tsc` and the tests can, so without this check a bad copy would only fail at deploy.

  `pnpm build` runs the check first.

## Architecture

**Contracts.** Every API shape comes from `contracts/`. `lib/api.ts` is the only place that calls `fetch`, and it validates every response. Errors become an `ApiError` with the HTTP status and the backend's `code`. A 401 is retried once with a fresh Clerk token, and if it persists a "session expired" notice offers to sign in again.

**State.**
- **TanStack Query** holds all server state: tasks (paged), messages (paged backwards with a cursor), the active run and credits.
- **Zustand** (`stores/chatStore.ts`) holds only what the server doesn't know yet:
  - messages that are sent but not yet confirmed;
  - the run in flight for each task, with its stream token;
  - unsent drafts for each task, kept in session storage so a reload doesn't lose them;
  - the artifact panel.
- Components read the store through narrow selectors.

**Sending.**
- **Matching:** a message shows as soon as it's sent. The server's copy is matched to it by a client-chosen `clientMessageId`, so it never flickers or appears twice.
- **Failures:** a failure puts the text back in the box and explains why. When the outcome is unclear (a timeout, a bad gateway), the app asks the server whether the message arrived before calling it a failure.
- **First send:** from home, the app creates the task, sends the message, then moves to the task.

**Realtime.**
- **Live stream:** `useAgentStream` subscribes to the run's Trigger.dev stream (`"chunks"`) and its metadata, using the token the backend gives for that run. Chunks are validated and folded into blocks with `foldChunks`. The token is refreshed 30 seconds before it expires.
- **Fallback:** if the stream fails, or there is no token, the page checks `GET /api/chats/:id/active-run` every 2 seconds and shows the server's saved progress. It tries the stream again later.
- **The server decides the end:** only the server says when a run is over. The saved reply is loaded before the streaming one is removed, so they swap without a gap.
- **Reloads:** a reload mid-run picks the run back up from the server.

**Virtual list.** The conversation uses `@tanstack/react-virtual` with measured rows:
- only the rows on screen are in the page;
- scrolling near the top loads older messages without moving what you're reading;
- it follows new content only when you're within 80px of the bottom, and a button takes you back down.

**Artifact panel.** There are three columns: the sidebar, the chat, and a 420px panel styled like magica's Image Preview.
- **Opening:** it opens when you click a picture, or by itself when a run makes one (once per picture; not on phones, where it would cover the reply).
- **Closing:** with Escape or the close button, or when you move to another task.

## Deliberate differences from magica.com

- **Not built** (the buttons are there but do nothing):
  - plan mode, model switching, attachments, connectors and voice;
  - search, the Projects, Library, Tools and task-list pages, pricing and upgrade;
  - the template gallery, branching and feedback;
  - renaming and pinning tasks (the backend has no route for them yet).
- **Image Preview** is a side panel here and a centered dialog on magica. The file name and size are left out, because the asset contract has neither.
- **Font**: Figtree, a free lookalike of magica's Circular.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Clerk · Zustand · TanStack Query · TanStack Virtual · Trigger.dev Realtime · shadcn/ui · Tailwind CSS 4 · Zod 4 · MSW · Vitest · Playwright
