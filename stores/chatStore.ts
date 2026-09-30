import { create } from "zustand";

// The composer draft for the home screen, where there is no chat yet.
export const NEW_CHAT = "new";

export interface OptimisticMessage {
  // a UUID chosen by the client; the server stores it on the message, so the two can be matched
  clientMessageId: string;
  chatId: string;
  content: string;
  createdAt: string;
}

// A run the server has started and that has not finished yet.
export interface RunInFlight {
  runId: string;
  triggerRunId: string | null;
  // for the live stream (Phase 5); null when the server didn't give one
  realtimeToken: string | null;
  realtimeTokenExpiresAt: string | null;
  // when we learned of it, so an older active-run answer can't be mistaken for "it finished"
  startedAt: number;
}

interface ArtifactPanel {
  isOpen: boolean;
  url: string | null;
  type: "image" | "video" | null;
  title: string | null;
}

interface ChatStore {
  // unsent text, per chat (or NEW_CHAT), so switching tasks never loses a draft
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;

  // messages shown before the server confirms them
  optimistic: Record<string, OptimisticMessage[]>;
  addOptimistic: (message: OptimisticMessage) => void;
  removeOptimistic: (chatId: string, clientMessageId: string) => void;

  // After a failed send, the same text sent again reuses its id, so the server can tell it is the same
  // message even if the first attempt did reach it.
  failedSends: Record<string, { content: string; clientMessageId: string }>;
  rememberFailedSend: (key: string, send: { content: string; clientMessageId: string }) => void;
  forgetFailedSend: (key: string) => void;

  // Stop was pressed before the server said which run it is (the send is still in flight). The run is
  // cancelled the moment it is known.
  stopRequested: Record<string, true>;
  requestStop: (chatId: string) => void;
  clearStopRequest: (chatId: string) => void;

  runs: Record<string, RunInFlight>;
  setRun: (chatId: string, run: RunInFlight) => void;
  // what we learn about the run in flight later (a fresh stream token, its Trigger.dev id)
  patchRun: (chatId: string, patch: Partial<Omit<RunInFlight, "runId">>) => void;
  // Stop was accepted; the server hasn't confirmed the run is over yet
  stopping: Record<string, true>;
  setStopping: (chatId: string) => void;
  clearStopping: (chatId: string) => void;
  clearRun: (chatId: string) => void;

  artifactPanel: ArtifactPanel;
  openArtifactPanel: (url: string, type: "image" | "video", title?: string) => void;
  closeArtifactPanel: () => void;
}

const without = <T,>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key)) as Record<string, T>;

const CLOSED_PANEL: ArtifactPanel = { isOpen: false, url: null, type: null, title: null };

export const useChatStore = create<ChatStore>((set) => ({
  drafts: {},
  // an empty draft is removed rather than kept, so the map doesn't grow with every visited chat
  setDraft: (key, text) =>
    set((s) => ({ drafts: text ? { ...s.drafts, [key]: text } : without(s.drafts, key) })),

  optimistic: {},
  addOptimistic: (message) =>
    set((s) => ({ optimistic: { ...s.optimistic, [message.chatId]: [...(s.optimistic[message.chatId] ?? []), message] } })),
  removeOptimistic: (chatId, clientMessageId) =>
    set((s) => {
      const remaining = (s.optimistic[chatId] ?? []).filter((m) => m.clientMessageId !== clientMessageId);
      return { optimistic: remaining.length ? { ...s.optimistic, [chatId]: remaining } : without(s.optimistic, chatId) };
    }),

  failedSends: {},
  rememberFailedSend: (key, send) => set((s) => ({ failedSends: { ...s.failedSends, [key]: send } })),
  forgetFailedSend: (key) => set((s) => ({ failedSends: without(s.failedSends, key) })),

  stopRequested: {},
  requestStop: (chatId) => set((s) => ({ stopRequested: { ...s.stopRequested, [chatId]: true } })),
  clearStopRequest: (chatId) => set((s) => ({ stopRequested: without(s.stopRequested, chatId) })),

  runs: {},
  setRun: (chatId, run) => set((s) => ({ runs: { ...s.runs, [chatId]: run } })),
  patchRun: (chatId, patch) => set((s) => (s.runs[chatId] ? { runs: { ...s.runs, [chatId]: { ...s.runs[chatId], ...patch } } } : s)),
  // the run is over: whatever stop was waiting for it is done too
  clearRun: (chatId) => set((s) => ({ runs: without(s.runs, chatId), stopping: without(s.stopping, chatId), stopRequested: without(s.stopRequested, chatId) })),
  stopping: {},
  setStopping: (chatId) => set((s) => (s.runs[chatId] ? { stopping: { ...s.stopping, [chatId]: true } } : s)),
  clearStopping: (chatId) => set((s) => ({ stopping: without(s.stopping, chatId) })),

  artifactPanel: CLOSED_PANEL,
  openArtifactPanel: (url, type, title) => set({ artifactPanel: { isOpen: true, url, type, title: title ?? null } }),
  closeArtifactPanel: () => set({ artifactPanel: CLOSED_PANEL }),
}));
