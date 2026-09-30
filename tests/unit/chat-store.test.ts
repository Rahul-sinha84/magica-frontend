import { describe, expect, it } from "vitest";
import { useChatStore } from "@/stores/chatStore";

const get = () => useChatStore.getState();
const msg = (id: string, chatId = "c1") => ({ clientMessageId: id, chatId, content: id, createdAt: "2026-01-01T00:00:00Z" });

describe("chat store", () => {
  it("keeps a draft per chat", () => {
    get().setDraft("a", "one");
    get().setDraft("b", "two");
    expect(get().drafts).toEqual({ a: "one", b: "two" });
  });

  it("adds and removes optimistic messages for one chat only", () => {
    get().addOptimistic(msg("x"));
    get().addOptimistic(msg("y", "c2"));
    get().removeOptimistic("c1", "x");
    expect(get().optimistic.c1 ?? []).toEqual([]);
    expect(get().optimistic.c2).toHaveLength(1);
  });

  it("tracks runs per chat", () => {
    get().setRun("a", { runId: "r1", triggerRunId: null, realtimeToken: null, realtimeTokenExpiresAt: null, startedAt: 1 });
    get().setRun("b", { runId: "r2", triggerRunId: null, realtimeToken: null, realtimeTokenExpiresAt: null, startedAt: 1 });
    get().clearRun("a");
    expect(Object.keys(get().runs)).toEqual(["b"]);
  });

  it("remembers a failed send until it is forgotten", () => {
    get().rememberFailedSend("a", { content: "hi", clientMessageId: "id" });
    expect(get().failedSends.a.clientMessageId).toBe("id");
    get().forgetFailedSend("a");
    expect(get().failedSends.a).toBeUndefined();
  });

  it("opens and closes the artifact panel", () => {
    get().openArtifactPanel({ chatId: "c1", asset: { type: "image", url: "/i.png" }, createdAt: null, openedBy: "user" });
    expect(get().artifactPanel).toMatchObject({ isOpen: true, artifact: { chatId: "c1", asset: { url: "/i.png" } } });
    get().closeArtifactPanel();
    expect(get().artifactPanel.isOpen).toBe(false);
  });
});

describe("drafts across a reload", () => {
  it("keeps only the drafts, in this tab's session storage", () => {
    get().setDraft("c1", "half a thought");
    get().setRun("c1", { runId: "r", triggerRunId: null, realtimeToken: "secret", realtimeTokenExpiresAt: null, startedAt: 1 });
    const saved = JSON.parse(sessionStorage.getItem("magica-drafts") ?? "{}");
    expect(saved.state).toEqual({ drafts: { c1: "half a thought" } });
  });

  it("reads them back", async () => {
    sessionStorage.setItem("magica-drafts", JSON.stringify({ state: { drafts: { c2: "restored" } }, version: 0 }));
    await useChatStore.persist.rehydrate();
    expect(get().drafts.c2).toBe("restored");
  });
});
