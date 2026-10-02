import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { resetClerk } from "./mocks/clerk";
import { resetMockDb } from "./mocks/fixtures";
import { resetNavigation } from "./mocks/navigation";
import { realtime } from "./mocks/trigger";
import { transloadit } from "./mocks/transloadit";
import { server } from "./mocks/server";
import { useAttachmentsStore } from "@/stores/attachmentsStore";
import { useChatStore } from "@/stores/chatStore";

vi.mock("@clerk/nextjs", async () => (await import("./mocks/clerk")).clerkModule);
vi.mock("next/navigation", async () => (await import("./mocks/navigation")).navigationModule);
vi.mock("@trigger.dev/react-hooks", async () => (await import("./mocks/trigger")).triggerModule);
vi.mock("next/link", async () => (await import("./mocks/navigation")).linkModule);
vi.mock("@/lib/transloadit", async () => (await import("./mocks/transloadit")).transloaditModule);

// jsdom has no object URLs (for a picked file's preview)
let objectUrls = 0;
URL.createObjectURL = () => `blob:mock/${++objectUrls}`;
URL.revokeObjectURL = () => {};

// jsdom gaps that Radix UI (menus, dialogs, tooltips) relies on
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
});
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// a desktop-sized window unless a test says otherwise
export function setViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
}
setViewport(true);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  toast.dismiss(); // the toast list is global, so one test's toast would show up in the next
  server.resetHandlers();
  resetMockDb();
  transloadit.reset();
  useAttachmentsStore.setState({ byComposer: {} });
  resetClerk();
  resetNavigation();
  realtime.reset();
  useChatStore.setState(useChatStore.getInitialState(), true);
  localStorage.clear();
  sessionStorage.clear();
  setViewport(true);
});
afterAll(() => server.close());
