import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "magica-ui";
const saved = (collapsed: boolean) => JSON.stringify({ state: { sidebarCollapsed: collapsed }, version: 0 });

// a fresh copy of the store, as if the page had just loaded
async function loadStores() {
  vi.resetModules();
  return import("@/stores/uiStore");
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("uiStore", () => {
  it("starts expanded and waits to be asked before reading what was saved", async () => {
    localStorage.setItem(KEY, saved(true));
    const { useUiStore } = await loadStores();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);

    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it("saves the choice when you toggle", async () => {
    const { useUiStore } = await loadStores();
    useUiStore.getState().toggleSidebar();
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}").state.sidebarCollapsed).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}").state.sidebarCollapsed).toBe(false);
  });

  it("does not wipe the saved choice when the phone drawer changes before it is restored", async () => {
    localStorage.setItem(KEY, saved(true));
    const { useUiStore, useMobileSidebar } = await loadStores();

    // this ran on mount and used to overwrite the saved choice with the default
    useMobileSidebar.getState().setOpen(false);
    expect(localStorage.getItem(KEY)).toBe(saved(true));

    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it("never saves the phone drawer", async () => {
    const { useMobileSidebar } = await loadStores();
    useMobileSidebar.getState().setOpen(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("copes with a saved value that isn't JSON", async () => {
    localStorage.setItem(KEY, "{{{ nope");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { useUiStore } = await loadStores();
    await expect(useUiStore.persist.rehydrate()).resolves.not.toThrow();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("works without any storage at all (private mode, blocked site data)", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { useUiStore } = await loadStores();

    // zustand gives a store without `persist` when storage is unavailable; AppShell must cope
    expect(useUiStore.persist).toBeUndefined();
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });
});
