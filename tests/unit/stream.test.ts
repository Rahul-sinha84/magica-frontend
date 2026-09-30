import { describe, expect, it } from "vitest";
import { foldChunks, type AgentStreamChunk } from "@/contracts";

// foldChunks belongs to the backend's contracts; these pin down what the frontend relies on.
const start = (id: string): AgentStreamChunk => ({ type: "tool-start", toolCallId: id, toolName: "skill", toolInput: { name: id } });
const end = (id: string, status: "completed" | "failed" = "completed"): AgentStreamChunk => ({ type: "tool-end", toolCallId: id, status, durationMs: 1000 });

describe("foldChunks", () => {
  it("joins deltas into one block", () => {
    const blocks = foldChunks([
      { type: "text-delta", delta: "Hel" },
      { type: "text-delta", delta: "lo" },
    ]);
    expect(blocks).toEqual([{ type: "text", content: "Hello" }]);
  });

  it("gives the same blocks when the whole stream is replayed (a reconnect), with nothing doubled", () => {
    const chunks: AgentStreamChunk[] = [{ type: "thinking-delta", delta: "hmm" }, start("a"), end("a"), { type: "text-delta", delta: "done" }];
    const once = foldChunks(chunks);
    expect(foldChunks([...chunks])).toEqual(once);
    expect(once.filter((b) => b.type === "tool_call")).toHaveLength(1);
  });

  it("ignores a repeated start or end", () => {
    const blocks = foldChunks([start("a"), start("a"), end("a"), end("a")]);
    expect(blocks.map((b) => b.type)).toEqual(["tool_call", "tool_result"]);
  });

  it("pairs each end with its own start when tools overlap", () => {
    const blocks = foldChunks([start("a"), start("b"), end("b", "failed"), { type: "text-delta", delta: "x" }, end("a")]);
    const calls = blocks.filter((b) => b.type === "tool_call");
    expect(calls.map((c) => c.type === "tool_call" && [c.toolCallId, c.status])).toEqual([
      ["a", "completed"],
      ["b", "failed"],
    ]);
    // each result sits right after its call
    const ids = blocks.map((b) => ("toolCallId" in b ? `${b.type}:${b.toolCallId}` : b.type));
    expect(ids).toEqual(["tool_call:a", "tool_result:a", "tool_call:b", "tool_result:b", "text"]);
  });

  it("ignores an end that has no start", () => {
    expect(foldChunks([end("ghost")])).toEqual([]);
  });

  it("keeps a running step running until its end arrives", () => {
    const [call] = foldChunks([start("a")]);
    expect(call).toMatchObject({ type: "tool_call", status: "running" });
  });
});
