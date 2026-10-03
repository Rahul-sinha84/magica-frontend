# Magica Frontend

A clone of the logged-in app at [magica.com](https://magica.com): a chat with an AI agent that streams its thinking, its steps and the media it makes, with file attachments, plan mode, task search and API keys.

**Live app:** TODO(deploy)

| Repo | What it is | Port |
| --- | --- | --- |
| **magica-frontend** (this one) | The UI: Next.js 16, React 19 | 3001 |
| [magica-backend](https://github.com/Rahul-sinha84/magica-backend) | The API, the agent (Trigger.dev) and PostgreSQL | 3000 |

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # then fill in the Clerk keys
pnpm dev                           # http://localhost:3001
```

- **Clerk keys are required**, even in mock mode, because sign-in always goes through Clerk. A development instance is fine; the console notice about development keys is expected.
- In the Clerk dashboard, name the application "Magica" (the sign-in page shows it) and enable Apple sign-in, which magica's sign-in page offers.

## Backend: local or deployed

| Setting | Local | Deployed |
| --- | --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` (here) | `http://localhost:3000` | `https://magica-backend-production.up.railway.app` |
| `FRONTEND_ORIGIN` (backend) | `http://localhost:3001` | this app's deployed origin |
| Clerk keys | the same instance on both sides | the same instance on both sides |
| `NEXT_PUBLIC_TRIGGER_API_URL` | empty | empty |
| `NEXT_PUBLIC_DOCS_URL` | the hosted API reference, or empty | the hosted API reference |

- **`FRONTEND_ORIGIN` must equal this app's origin exactly.** The backend uses it for CORS and as Clerk's `authorizedParties`, so a token minted for any other site is refused. Vercel preview URLs are refused by design; only the production origin works.
- **Same Clerk instance:** the backend verifies the session token this app sends, so both sides need keys from one Clerk instance.
- **`NEXT_PUBLIC_TRIGGER_API_URL` stays empty.** The live stream then goes to Trigger.dev's cloud, which is what the backend uses. No Trigger.dev key goes here: the backend hands the browser a short-lived token for each run.
- **`NEXT_PUBLIC_DOCS_URL`** is the address of the backend's hosted API reference (its Mintlify docs). The API Keys dialog's "API Reference" opens it; while it's unset, that link is disabled.

### Mock mode (no backend)

For working without a backend, set `NEXT_PUBLIC_API_MOCKING=true` and restart `pnpm dev`. Every backend call is then answered in the browser by the mocks in `tests/mocks`:

- a few ready-made tasks, including a 240-message one;
- runs that take 4 seconds and are followed by polling (the mocks can't fake Trigger.dev's live stream);
- a picture when a message asks for an image, and a plan to approve in plan mode;
- the media library and API keys;
- data that survives a reload.

In mock mode, attach files from the Media Library. Uploading a new file goes to the real Transloadit, which refuses the mock's signature.

**A production build ignores the flag** unless `ALLOW_MOCKS_IN_BUILD=true` is also set when building, so a stray line in `.env.local` can't ship fake data.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on :3001 |
| `pnpm build` | `contracts:check`, then the production build |
| `pnpm start` | Serves the build on :3001 |
| `pnpm typecheck` | Route types (`next typegen`), then `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: unit and integration tests (MSW, no network) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Playwright (needs the Clerk keys) |
| `pnpm contracts:check` | Checks the synced contracts weren't edited here |
| `pnpm contracts:generate-lock` | Writes the lock file; run only by the backend's sync |
| `pnpm contracts:sync` | Only prints how to sync (from the backend); copies nothing |

## Architecture

### API layer

- `lib/api.ts` is the only place that calls `fetch`, and it validates every response against its contract.
- Errors become an `ApiError` with the HTTP status and the backend's `code`.
- A 401 is retried once with a fresh Clerk token. If it persists, a "session expired" notice offers to sign in again.

### State

- **TanStack Query** holds everything the server knows:
  - tasks (paged) and each task;
  - messages (paged backwards with a cursor);
  - the active run, with its saved progress and any pending approval;
  - credits, and the model's status;
  - the media library (paged, by tab and search), and search results;
  - API keys.
- **Zustand** holds only what the server doesn't know yet. Components read it through narrow selectors.
  - `chatStore`:
    - messages sent but not yet confirmed, and the ids of failed sends (so a resend isn't doubled);
    - the run in flight for each task, Stop requests, and stopping state;
    - the plan mode switch, and approvals this tab already answered;
    - unsent drafts (in session storage, so a reload keeps them);
    - the preview.
  - `attachmentsStore`: the files in each composer, with their upload progress.
  - `uiStore`: whether the sidebar is collapsed (kept in local storage), the phone drawer, and which dialog is open.
- **On an account change** (sign-out, or another account) the query cache, the chat store and saved drafts are cleared.

### Sending

- **No flicker:** a message shows as soon as it's sent. The server's copy is matched to it by a client-chosen `clientMessageId`, so it never flickers or appears twice.
- **Resends:** the same text, files and mode sent again after a failure keep that id.
- **Failures:** a failure puts the text and files back and explains why. When the outcome is unclear (a timeout, a bad gateway), the app first asks the server whether the message arrived.
- **First send from home:** creates the task, sends the message, then moves to the task.

### Realtime

- **Live stream:** `useAgentStream` subscribes to the run's Trigger.dev stream (`"chunks"`) and its metadata, using the token the backend gives for that run.
  - Chunks are validated, then folded into blocks by the contract's `foldChunks`. Folding is pure, so a replay never doubles anything.
  - The metadata says what the run is doing (thinking, a tool, waiting for approval, stopping).
- **Fallback:** if the stream fails or there's no token, the page checks `GET /api/chats/:id/active-run` every 2 seconds and shows the saved progress. It tries the stream again later. The stream token is refreshed 30 seconds before it expires.
- **The server decides when a run ends.** A finished stream only makes the page ask; the saved reply is loaded before the streaming one is removed, so they swap without a gap.
- **Reloads:** a reload mid-run picks the run back up, including a pending approval.
- **Background tabs:** a run in a hidden tab is still followed to its end.

### Virtual list

The conversation uses `@tanstack/react-virtual` with measured rows:

- only the rows on screen are in the page;
- scrolling near the top loads older messages without moving what you're reading;
- it follows new content only when you're within 80px of the bottom, and a button takes you back down.

### Uploads and attachments

- **Upload path:** the paperclip opens a small popover: upload from the device, or pick from the Media Library.
  1. Each file is checked against the backend's rules (type, size, name).
  2. The backend signs one Transloadit upload per file.
  3. Uppy sends it over tus straight to Transloadit (resumable, with progress on its chip).
  4. The backend is then told it arrived, and is polled until the file is in the library.
- **Sending:** a message carries its files as media ids (`attachments: [{ mediaAssetId }]`), up to 10.
- **Expiry:** files expire 23 hours after upload, an hour before Transloadit deletes them. An expired file shows as expired, can't be sent, and can be removed.
- **The Media Library:**
  - your uploads and generated media, newest first and grouped by day;
  - All / Generated / My Uploads tabs, search from 3 characters, and paging as you scroll;
  - its own Upload button.
  - Picking a file attaches it.

### Plan mode and approvals

- **Plan mode:** ⇧+Tab in the composer (or the amber "Plan" chip) turns it on, and sends then carry `mode: "plan"`. It isn't kept across a reload.
- **Plan card:** the agent proposes a plan, shown above the composer:
  - steps with estimated credits, and the total;
  - **Run All** (or Enter) approves it;
  - **Request Changes** asks for a revision (⌘/Ctrl+Enter sends, Esc cancels).
- **Spend card:** a step that costs more than the approval threshold waits on an Approve / Reject card.
- **One answer:** a double click sends once. A 503 keeps the card so the answer can be sent again.
- **The card goes when** the run says it was answered, the server returns it closed, or the run ends.
- **In the reply,** each one stays as a step: "Plan approved ✓ · 1m 16s", "Changes requested" with the feedback, "Spend declined", "Expired", "Stopped". Opening one shows the plan.

### Search, pin and rename

- **Search:** ⌘K / Ctrl+K (or the sidebar's search button) opens a palette. It shows recent tasks until you type, then searches titles and message text from 3 characters.
- **Task menu:** pin to top, inline rename, delete. ⌘⇧O / Ctrl⇧O starts a new task, and ⌘B / Ctrl+B shows or hides the sidebar.

### API keys

- **Opening:** the sidebar's **API / MCP** opens the API Keys dialog.
- **The dialog:**
  - the "n/10" counter;
  - a label and Create key, with optional per-minute and per-day limits and an expiry date;
  - the key list with masked prefixes, each to rename or re-limit inline, or revoke after a confirmation;
  - "API Reference", which opens the hosted docs (`NEXT_PUBLIC_DOCS_URL`).
- **What the keys are for:** the backend's public REST API (`/v1`), documented in its Mintlify docs.
- **The key itself** is shown once, with Copy. It's held only in the dialog's state, never in the query cache, and is gone when the dialog closes.

### Image Preview

- **Layout:** magica's centered Image / Video Preview: the picture on the left, its details on the right.
- **Details:** prompt with Copy, file name for uploads, created on, source, model, dimensions, format, Copy Link and Download.
- **When it opens:** only when a picture is clicked.
- **Download all:** a reply that made two or more pictures or videos has a "Download all" button that saves each file.
- **On phones:** a sheet from the bottom.

## Contracts

- **Owned by the backend:** every API shape (Zod schemas, plus `fold.ts`) comes from `contracts/`. The backend owns them and pushes them here with `pnpm contracts:sync` run **in the backend repo**:

  ```bash
  cd ../magica-backend
  pnpm contracts:sync        # set FRONTEND_REPO_PATH if this repo isn't next to it
  ```

- **Checked here** with `pnpm contracts:check`, which `pnpm build` runs first. It fails when:
  - a contract was edited, is missing, or isn't in the lock;
  - a file lacks the `// Generated from magica-backend` header;
  - a file has a relative `.js` import. Next.js can't build those, though `tsc` and the tests can, so without this check it would only fail at deploy.
- **Never edited here:** don't touch `contracts/*.ts` or `contracts.lock.json` by hand. This repo's `pnpm contracts:sync` only prints the instructions above.

## Deliberate differences from magica.com

| Difference | Why |
| --- | --- |
| **Step by Step** on the plan card is shown but disabled; only Run All works | The backend runs an approved plan as a whole; there is no step-at-a-time run |
| Media Library **favorites, the folder list, sort, filter and list view** look like magica's but are disabled | Uploads have no permanent storage to organise (next row) |
| Uploads live on **Transloadit's temporary storage** and expire (23 hours here; Transloadit deletes after 24) | No storage bucket in this build; the app marks files expired an hour early, so a link never dies mid-turn |
| **Attachments reach the model as links** (`[Attached image: <url>]`), not as images | The backend writes each file into the prompt as its link, and tools like Crop Image work from that link; no image is sent for the model to see |
| **No model switching.** "Magica Auto" is shown but inert, and the composer shows the OpenRouter Free status | The backend runs every turn on OpenRouter's free router |
| **API / MCP** opens the API Keys dialog | On magica it opens the docs, and keys live under Settings → API Keys; Settings isn't built here. The dialog links to the hosted API reference instead; "MCP Server" is inert |
| API keys start `mgc_`, with the contract's limits: 1–10,000 per minute, 1–100,000 per day | magica's start `gx_` and allow 1–100 per minute, up to 144,000 per day |
| **Revoking a key asks first** | magica's confirmation couldn't be checked without revoking a real key |
| The **spend approval card** is designed here | No magica spend card was seen without spending real credits |
| The **Request Changes** box closes on Esc, and has Cancel / Submit buttons on touch screens | Esc didn't close it on magica; with no keyboard, a phone couldn't submit it |
| The **Image Preview** leaves out the file size | The asset contract has no size |
| **Font:** Figtree | A free lookalike of magica's Circular |

**Not built** (shown, but they do nothing):
- **Pages:** Tasks, Projects, Library and Tools; Help & Support, Unfair Advantage, Settings, Updates and Invite team members.
- **Billing:** pricing, Add Credits and Upgrade.
- **Composer:** connectors (the plug) and voice (the mic).
- **Not built:** model switching and the MCP server. (The public REST API is built, in the backend: `/v1`, used with the keys this app creates, with its Mintlify docs.)
- **Home:** the template gallery.
- **On messages and tasks:** branching (fork) and 👍 / 👎 feedback, Duplicate in the task menu, "View all" tasks, and the header's files button.
- **On pictures:** "Use as reference", and the preview's Add to Favorite and Delete File.

## With more time

- **Step by Step** plan runs, with an approval per step.
- **Real storage** (S3 or R2) for uploads, so files don't expire. That would also enable the Media Library's favorites, folders, sort, filter and list view, and Delete File.
- **Vision:** send attached images to a vision model rather than as links.
- **An MCP server** on top of the public REST API, with its documentation.
- **End-to-end tests against the real backend:** signed-in Playwright runs (a Clerk testing token) through a real Trigger.dev run, an upload and an approval.
- **Model switching**, with the model picker.
- **The Settings dialog**, so API keys also live where magica keeps them.
- **Countdowns:** an expiry countdown on plan and spend cards (they expire after 30 minutes).
- **Dark mode** compared side by side with magica's, and visual regression tests against reference screenshots.

## Testing

```bash
pnpm test        # Vitest
pnpm test:e2e    # Playwright; the first time, run: pnpm exec playwright install chromium
```

- **Vitest + Testing Library + MSW** (`tests/unit`, `tests/integration`):
  - The MSW handlers follow the backend's contracts and messages. Stand-ins replace Trigger.dev's realtime hooks and the Transloadit upload, so nothing touches the network.
  - **Unit:** contracts and folding, the API client, utilities and stores, and components on their own (message content, steps, approvals).
  - **Integration:**
    - sending (optimistic messages, failures, resends) and the first send from home;
    - streaming, the polling fallback, token refresh, restoring a run and runs in background tabs;
    - Stop, retry and queued turns;
    - the virtual list;
    - the preview;
    - attachments and the Media Library;
    - search, pin and rename;
    - plan mode and approvals;
    - API keys;
    - the app shell, sidebar and credits.
- **Playwright** (`tests/e2e`), skipped without the Clerk keys. It starts `pnpm dev` itself and covers sign-in:
  - signed-out visitors are sent to sign-in, and back to the task they asked for afterwards;
  - the sign-in page renders;
  - a spinner shows, rather than a blank page, while Clerk is unreachable.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Clerk · TanStack Query · TanStack Virtual · Zustand · Trigger.dev Realtime · Uppy + Transloadit · Radix UI / shadcn/ui · Tailwind CSS 4 · Zod 4 · MSW · Vitest · Playwright
