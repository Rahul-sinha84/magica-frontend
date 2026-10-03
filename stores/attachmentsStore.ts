import { create } from "zustand";
import type { MediaAsset } from "@/contracts";

// uploading → processing (the upload service has it; the server is checking) → ready; or failed / expired
export type AttachmentStatus = "uploading" | "processing" | "ready" | "failed" | "expired";

// A file waiting in a composer to go with the next message: one being uploaded, or one from the media library.
export interface Attachment {
  // local, for the list
  id: string;
  name: string;
  kind: "image" | "video" | "audio";
  status: AttachmentStatus;
  // 0 to 1 while uploading
  progress: number;
  // the picture the chip shows: the local file while it uploads, the library's copy for a picked one
  previewUrl: string | null;
  // set once the file is in the media library; its id is what a message sends
  asset: MediaAsset | null;
  // why it failed, in words that can be shown
  error: string | null;
}

interface AttachmentsStore {
  // per composer (a chat's id, or the home screen's), in the order they were added
  byComposer: Record<string, Attachment[]>;
  add: (key: string, items: Attachment[]) => void;
  update: (key: string, id: string, patch: Partial<Attachment>) => void;
  remove: (key: string, id: string) => void;
  set: (key: string, items: Attachment[]) => void;
}

// Not remembered across reloads: a file being uploaded can't outlive the page.
export const useAttachmentsStore = create<AttachmentsStore>()((set) => ({
  byComposer: {},
  add: (key, items) => set((s) => ({ byComposer: { ...s.byComposer, [key]: [...(s.byComposer[key] ?? []), ...items] } })),
  update: (key, id, patch) =>
    set((s) => ({ byComposer: { ...s.byComposer, [key]: (s.byComposer[key] ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)) } })),
  remove: (key, id) => set((s) => ({ byComposer: { ...s.byComposer, [key]: (s.byComposer[key] ?? []).filter((item) => item.id !== id) } })),
  set: (key, items) => set((s) => ({ byComposer: { ...s.byComposer, [key]: items } })),
}));
