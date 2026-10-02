import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { addLongChat, addRetryChat, addToolsChat, getMockDb, setMockDb, type MockDb } from "./fixtures";

// The mock backend's data lives in this tab's session storage, so reloading mid-run finds the same run
// (and the same tasks). Closing the tab starts fresh.
const KEY = "magica-mock-db";

function load(): MockDb | null {
  try {
    const saved = sessionStorage.getItem(KEY);
    return saved ? (JSON.parse(saved) as MockDb) : null;
  } catch {
    return null;
  }
}

const saved = load();
// data saved before the media library existed has none
if (saved) setMockDb({ ...saved, media: saved.media ?? [], uploads: saved.uploads ?? {}, waitpoints: saved.waitpoints ?? {}, plans: saved.plans ?? {} });
else {
  addLongChat();
  addRetryChat();
  addToolsChat();
}

export const worker = setupWorker(...handlers);

worker.events.on("response:mocked", () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(getMockDb()));
  } catch {
    // storage full or blocked: the mock still works, it just forgets on reload
  }
});
