import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

// The collapsed choice is remembered. Hydration is manual (see AppShell) so the first client
// render matches the server. Keep anything that changes on mount out of this store: a write
// before rehydrate() would overwrite what was saved.
export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "magica-ui", skipHydration: true },
  ),
);

// The phone drawer is never remembered, so it lives in its own store.
interface MobileSidebar {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useMobileSidebar = create<MobileSidebar>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

// The chat search palette (⌘K). Not remembered either.
interface ChatSearchPalette {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useChatSearchPalette = create<ChatSearchPalette>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
