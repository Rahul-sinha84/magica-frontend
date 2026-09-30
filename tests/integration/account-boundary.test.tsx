import { describe, expect, it, vi } from "vitest";
import { AccountBoundary, DRAFTS_OWNER_KEY } from "@/providers/AccountBoundary";
import { DRAFTS_KEY, useChatStore } from "@/stores/chatStore";
import { clerkState } from "../mocks/clerk";
import { renderApp } from "../utils/render";

const store = () => useChatStore.getState();

describe("switching accounts in the same tab", () => {
  it("drops the previous account's cached data, drafts and runs", () => {
    const { client, rerender } = renderApp(<AccountBoundary />);
    client.setQueryData(["chats"], { pages: [{ chats: [{ id: "a-secret-task" }] }] });
    store().setDraft("chat-a", "private thought");
    store().setRun("chat-a", { runId: "r", triggerRunId: null, realtimeToken: "t", realtimeTokenExpiresAt: null, startedAt: 1 });

    clerkState.userId = "user_b";
    rerender(<AccountBoundary />);

    expect(client.getQueryData(["chats"])).toBeUndefined();
    expect(store().drafts).toEqual({});
    expect(store().runs).toEqual({});
    expect(sessionStorage.getItem(DRAFTS_OWNER_KEY)).toBe("user_b");
  });

  it("drops everything on sign-out too", () => {
    const { client, rerender } = renderApp(<AccountBoundary />);
    client.setQueryData(["credits"], { balance: 1, held: 0 });
    clerkState.isSignedIn = false;
    rerender(<AccountBoundary />);
    expect(client.getQueryData(["credits"])).toBeUndefined();
  });

  it("keeps everything when it's the same account", () => {
    const { client, rerender } = renderApp(<AccountBoundary />);
    client.setQueryData(["credits"], { balance: 1, held: 0 });
    store().setDraft("chat-a", "keep me");
    rerender(<AccountBoundary />);
    expect(client.getQueryData(["credits"])).toBeDefined();
    expect(store().drafts["chat-a"]).toBe("keep me");
  });

  it("drops drafts another account left in this tab", () => {
    sessionStorage.setItem(DRAFTS_OWNER_KEY, "someone_else");
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify({ state: { drafts: { new: "their words" } }, version: 0 }));
    store().setDraft("new", "their words");
    renderApp(<AccountBoundary />);
    expect(store().drafts).toEqual({});
    expect(JSON.parse(sessionStorage.getItem(DRAFTS_KEY) ?? "{}").state?.drafts ?? {}).toEqual({});
  });

  it("keeps drafts that belong to this account", () => {
    sessionStorage.setItem(DRAFTS_OWNER_KEY, "user_mock");
    store().setDraft("new", "my words");
    renderApp(<AccountBoundary />);
    expect(store().drafts.new).toBe("my words");
  });
});

describe("drafts when storage is blocked", () => {
  it("typing still works", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => store().setDraft("c1", "still typing")).not.toThrow();
    expect(store().drafts.c1).toBe("still typing");
  });
});
