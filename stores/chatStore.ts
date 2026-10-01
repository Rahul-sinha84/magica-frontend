import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ImageBlock, VideoBlock } from "@/types";

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
  // the server's view: waiting in Trigger.dev's queue, or started
  status: "PENDING" | "RUNNING";
  // when `status` was last set, so an older active-run answer can't move it back
  statusAt: number;
}

// The generated picture or video shown in the side panel, and the task it belongs to (the panel only
// stays open while that task is on screen).
export interface Artifact {
  chatId: string;
  asset: ImageBlock | VideoBlock;
  // when it was made (the message's time), if known
  createdAt: string | null;
  // opened by a click (focus moves into the panel) or by a newly generated asset (focus stays put)
  openedBy: "user" | "stream";
}

interface ArtifactPanel {
  isOpen: boolean;
  artifact: Artifact | null;
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
  openArtifactPanel: (artifact: Artifact) => void;
  // a picture or video a run just made opens by itself, once: closing it keeps it closed
  showNewArtifact: (runId: string, artifact: Artifact) => void;
  // which run's assets have already opened by themselves, by run id and address
  shownArtifacts: Record<string, true>;
  closeArtifactPanel: () => void;
}

const without = <T,>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key)) as Record<string, T>;

const CLOSED_PANEL: ArtifactPanel = { isOpen: false, artifact: null };

export const DRAFTS_KEY = "magica-drafts";

// Session storage that never throws: blocked storage (private windows, "block all site data") or a full
// quota must not break typing. Drafts then simply aren't kept across a reload.
const safeSessionStorage = {
  getItem: (name: string) => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      sessionStorage.setItem(name, value);
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      sessionStorage.removeItem(name);
    } catch {}
  },
};

// Only the unsent drafts are kept, in this tab's session storage, so a reload doesn't lose what you were
// typing. Everything else (runs, pending messages) comes back from the server. Like the ui store, it is
// read back after the first render (see AppShell), so the server's render and the first client one match.
export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
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
  openArtifactPanel: (artifact) => set({ artifactPanel: { isOpen: true, artifact } }),
  shownArtifacts: {},
  showNewArtifact: (runId, artifact) =>
    set((s) => {
      const key = `${runId}:${artifact.asset.url}`;
      if (s.shownArtifacts[key]) return s;
      // On a phone the panel covers the whole screen, so it doesn't open by itself there (it would cover
      // the conversation mid-reply); the picture is in the reply, one tap away.
      const wide = typeof window === "undefined" || !window.matchMedia || window.matchMedia("(min-width: 768px)").matches;
      return { shownArtifacts: { ...s.shownArtifacts, [key]: true }, ...(wide && { artifactPanel: { isOpen: true, artifact } }) };
    }),
  closeArtifactPanel: () => set({ artifactPanel: CLOSED_PANEL }),
    }),
    {
      name: DRAFTS_KEY,
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) => ({ drafts: s.drafts }),
      skipHydration: true,
    },
  ),
);
