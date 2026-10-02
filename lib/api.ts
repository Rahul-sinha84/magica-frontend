import type { z } from "zod";
import {
  ActiveRunResponseSchema,
  ChatListResponseSchema,
  ChatResponseSchema,
  ChatSearchResponseSchema,
  CreateChatResponseSchema,
  CreditsResponseSchema,
  ErrorCodeSchema,
  MessageListResponseSchema,
  ModelsResponseSchema,
  RetryRunResponseSchema,
  SendMessageResponseSchema,
} from "@/contracts";
import type { UpdateChatBody } from "@/contracts";
import { BACKEND_URL } from "./config";
import { ApiError } from "./queryClient";

type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

interface SendMessageInput {
  content: string;
  // chosen by the caller so a retry or a lost response can never create a second message
  clientMessageId: string;
  attachments?: string[];
}

const enc = encodeURIComponent;

// AbortSignal.any() is missing before Safari 17.4, which Next.js still supports.
function anySignal(...signals: AbortSignal[]) {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// The backend's error shape is ErrorResponse: { error, code, details? }. Each part is read on its own,
// so a code added by a newer backend still leaves the message usable. Anything else (an HTML page from
// a proxy, say) yields no message and no code, and describeStatus takes over.
function readError(body: unknown) {
  const field = (name: string) => (typeof body === "object" && body !== null ? (body as Record<string, unknown>)[name] : undefined);
  const error = field("error");
  const code = ErrorCodeSchema.safeParse(field("code"));
  return { error: typeof error === "string" ? error : "", code: code.success ? code.data : undefined };
}

function describeStatus(status: number) {
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "That couldn't be found.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "The server ran into a problem. Try again in a moment.";
  return `Request failed (${status}).`;
}

// The only place in the app that talks to the backend. Every JSON response is validated
// against its contract before anything else sees it.
export function createApi(getToken: GetToken, { timeoutMs = 30_000 } = {}) {
  async function token(options?: { skipCache?: boolean }) {
    try {
      return await getToken(options);
    } catch {
      // Clerk throws when it needs the network to refresh an expired token
      throw new ApiError(0, "Could not verify your session. Check your connection and try again.");
    }
  }

  async function send(path: string, { method = "GET", body, signal }: RequestOptions, bearer: string) {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      return await fetch(`${BACKEND_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? anySignal(signal, timeout) : timeout,
      });
    } catch (error) {
      if (signal?.aborted) throw error; // the caller cancelled, nothing to report
      throw new ApiError(0, timeout.aborted ? "The server took too long to respond." : "Could not reach the server.");
    }
  }

  async function call(path: string, options: RequestOptions = {}) {
    const bearer = await token();
    if (!bearer) throw new ApiError(401, "You are signed out. Sign in again to continue.");

    let res = await send(path, options, bearer);
    if (res.status === 401) {
      // the short-lived token may have just expired, so retry once with a fresh one
      const fresh = await token({ skipCache: true });
      if (fresh && fresh !== bearer) res = await send(path, options, fresh);
    }
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const { error, code } = readError(body);
      throw new ApiError(res.status, error || describeStatus(res.status), body, code);
    }
    return res;
  }

  async function json<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions) {
    const res = await call(path, options);
    const data: unknown = await res.json().catch(() => {
      throw new ApiError(502, "The server sent an unreadable response.");
    });
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      console.error(`Contract validation failed for ${path}`, parsed.error.issues);
      throw new ApiError(422, "The server sent an unexpected response.", parsed.error.issues);
    }
    return parsed.data;
  }

  const empty = async (path: string, options: RequestOptions) => {
    await call(path, options);
  };

  return {
    chats: {
      // the server orders the list (pinned first, then recent) and pages it; pass back the cursor it gave
      list: (cursor?: string | null, signal?: AbortSignal) =>
        json(`/api/chats${cursor ? `?cursor=${enc(cursor)}` : ""}`, ChatListResponseSchema, { signal }),
      get: (chatId: string, signal?: AbortSignal) => json(`/api/chats/${enc(chatId)}`, ChatResponseSchema, { signal }),
      // without a title the server names the chat
      create: (title?: string) =>
        json("/api/chats", CreateChatResponseSchema, { method: "POST", body: title ? { title } : {} }),
      delete: (chatId: string) => empty(`/api/chats/${enc(chatId)}`, { method: "DELETE" }),
      // rename and/or pin; the server answers with the chat as it now is
      update: (chatId: string, body: UpdateChatBody) =>
        json(`/api/chats/${enc(chatId)}`, ChatResponseSchema, { method: "PATCH", body }),
      // titles and message text, at least SEARCH_QUERY_MIN characters; pass back the cursor for the next page
      search: (q: string, cursor?: string | null, signal?: AbortSignal) =>
        json(`/api/chats/search?q=${enc(q)}${cursor ? `&cursor=${enc(cursor)}` : ""}`, ChatSearchResponseSchema, { signal }),
    },
    messages: {
      list: (chatId: string, cursor?: string | null, signal?: AbortSignal) =>
        json(
          `/api/chats/${enc(chatId)}/messages${cursor ? `?cursor=${enc(cursor)}` : ""}`,
          MessageListResponseSchema,
          { signal },
        ),
      send: (chatId: string, { content, clientMessageId, attachments = [] }: SendMessageInput) =>
        json(`/api/chats/${enc(chatId)}/messages`, SendMessageResponseSchema, {
          method: "POST",
          body: { content, clientMessageId, attachments },
        }),
    },
    runs: {
      getActive: (chatId: string, signal?: AbortSignal) =>
        json(`/api/chats/${enc(chatId)}/active-run`, ActiveRunResponseSchema, { signal }),
      cancel: (runId: string) => empty(`/api/runs/${enc(runId)}/cancel`, { method: "POST" }),
      // answers the same question again as a new turn; 201 for a new retry, 200 if it had already started
      retry: (runId: string) => json(`/api/runs/${enc(runId)}/retry`, RetryRunResponseSchema, { method: "POST" }),
    },
    credits: {
      get: (signal?: AbortSignal) => json("/api/credits", CreditsResponseSchema, { signal }),
    },
    models: {
      // the models on offer (only OpenRouter's free router) and how it has been doing lately
      get: (signal?: AbortSignal) => json("/api/models", ModelsResponseSchema, { signal }),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
