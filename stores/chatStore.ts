import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RunMode } from "@/contracts";
import type { ImageBlock, MessageAttachment, VideoBlock } from "@/types";

// The composer draft for the home screen, where there is no chat yet.
export const NEW_CHAT = "new";

export interface OptimisticMessage {
  // a UUID chosen by the client; the server stores it on the message, so the two can be matched
  clientMessageId: string;
  chatId: string;
  content: string;
  createdAt: string;
  // the files it carries, in order
  attachments?: MessageAttachment[];
}

// A send that didn't go: sent again with the same text, the same files and the same mode, it keeps its id.
export interface FailedSend {
  content: string;
  clientMessageId: string;
  attachmentIds?: string[];
  mode?: RunMode;
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
  // how it was opened (magica only opens it from a click)
  openedBy: "user" | "stream";
  // for a file from the media library: whether the user uploaded it, and its name (uploads have one); a picture
  // from a reply has neither and was generated in the chat
  source?: "upload" | "generated";
  name?: string | null;
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
  failedSends: Record<string, FailedSend>;
  rememberFailedSend: (key: string, send: FailedSend) => void;
  forgetFailedSend: (key: string) => void;

  // Stop was pressed before the server said which run it is (the send is still in flight). The run is
  // cancelled the moment it is known.
  stopRequested: Record<string, true>;
  requestStop: (chatId: string) => void;
  clearStopRequest: (chatId: string) => void;

  // Plan mode (⇧+Tab, or the composer's "Plan" chip): the next messages ask for a plan to approve before anything
  // is spent. One switch for every composer, as on magica, and not kept across a reload.
  planMode: boolean;
  setPlanMode: (on: boolean) => void;

  // waitpoints this tab knows are closed (its own answer came back closed), so their card goes at once, before
  // the run's own word that it moved on
  closedWaitpoints: Record<string, true>;
  closeWaitpoint: (waitpointId: string) => void;

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

      planMode: false,
      setPlanMode: (on) => set({ planMode: on }),

      closedWaitpoints: {},
      closeWaitpoint: (waitpointId) => set((s) => ({ closedWaitpoints: { ...s.closedWaitpoints, [waitpointId]: true } })),

      runs: {},
      setRun: (chatId, run) => set((s) => ({ runs: { ...s.runs, [chatId]: run } })),
      patchRun: (chatId, patch) => set((s) => (s.runs[chatId] ? { runs: { ...s.runs, [chatId]: { ...s.runs[chatId], ...patch } } } : s)),
      // the run is over: whatever stop was waiting for it is done too
      clearRun: (chatId) =>
        set((s) => ({ runs: without(s.runs, chatId), stopping: without(s.stopping, chatId), stopRequested: without(s.stopRequested, chatId) })),
      stopping: {},
      setStopping: (chatId) => set((s) => (s.runs[chatId] ? { stopping: { ...s.stopping, [chatId]: true } } : s)),
      clearStopping: (chatId) => set((s) => ({ stopping: without(s.stopping, chatId) })),

      artifactPanel: CLOSED_PANEL,
      openArtifactPanel: (artifact) => set({ artifactPanel: { isOpen: true, artifact } }),
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
