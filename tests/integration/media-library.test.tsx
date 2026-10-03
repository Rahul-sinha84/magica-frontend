import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaLibraryDialog } from "@/components/media/MediaLibraryDialog";
import { BACKEND_URL } from "@/lib/config";
import type { MediaAsset } from "@/types";
import { getMockDb } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const NOON = new Date("2026-10-02T12:00:00");
const hoursAgo = (hours: number) => new Date(NOON.getTime() - hours * 3_600_000).toISOString();

// a library at a known time of day, so "Today" can't slip into yesterday at midnight
function library(): MediaAsset[] {
  const upload = (id: string, name: string, type: MediaAsset["type"], mimeType: string, hours: number): MediaAsset => ({
    id, source: "upload", type, url: "/mock/red-apple.svg", name, prompt: null, model: null, width: 800, height: 600, mimeType, createdAt: hoursAgo(hours), expiresAt: new Date(NOON.getTime() + 20 * 3_600_000).toISOString(),
  });
  const generated = (id: string, prompt: string, hours: number): MediaAsset => ({
    id, source: "generated", type: "image", url: "/mock/red-apple.svg", name: null, prompt, model: "GPT Image 2", width: 1024, height: 1024, mimeType: "image/png", createdAt: hoursAgo(hours), expiresAt: null,
  });
  return [
    upload("m-beach", "beach.jpg", "image", "image/jpeg", 1),
    generated("m-apple", "A red apple on a table", 2),
    upload("m-clip", "waves.mp4", "video", "video/mp4", 3),
    generated("m-cat", "A cat asleep on a windowsill", 50),
  ];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  getMockDb().media = library();
});
afterEach(() => {
  vi.useRealTimers();
  server.events.removeAllListeners();
});

function mediaRequests() {
  const seen: URL[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/media") seen.push(url);
  });
  return seen;
}

function openLibrary() {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  const view = renderApp(<MediaLibraryDialog open onOpenChange={onOpenChange} onPick={onPick} />);
  return { ...view, onPick, onOpenChange };
}

const tiles = () => screen.getAllByRole("button", { name: /^(Image|Video|Audio): / }).map((b) => b.getAttribute("aria-label"));

describe("the media library", () => {
  it("shows the whole library's count, the newest first, grouped by day", async () => {
    openLibrary();
    expect(await screen.findByText("4 files")).toBeInTheDocument();
    const today = screen.getByRole("region", { name: "Today" });
    expect(within(today).getByText("03 Items")).toBeInTheDocument();
    expect(within(today).getAllByRole("button", { name: /^(Image|Video): / }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Image: beach.jpg",
      "Image: A red apple on a table",
      "Video: waves.mp4",
    ]);
    const older = screen.getByRole("region", { name: "Sep 30, 2026" });
    expect(within(older).getByText("01 Item")).toBeInTheDocument();
    // the file type on each tile
    expect(within(today).getByText("JPG")).toBeInTheDocument();
    expect(within(today).getByText("MP4")).toBeInTheDocument();
  });

  it("names a file's type from its address when the service gave no type (crop results)", async () => {
    getMockDb().media = [
      { ...library()[1], id: "m-crop", prompt: "Crop Image", mimeType: null, url: "https://cdn.example.com/crops/abc123.webp" },
      { ...library()[1], id: "m-odd", prompt: "Something else", mimeType: null, url: "https://cdn.example.com/out/abc123" },
    ];
    openLibrary();
    const crop = (await screen.findByRole("button", { name: "Image: Crop Image" })).closest("li")!;
    expect(within(crop).getByText("WEBP")).toBeInTheDocument();
    const odd = screen.getByRole("button", { name: "Image: Something else" }).closest("li")!;
    expect(odd.querySelectorAll("span.rounded")).toHaveLength(0);
  });

  it("filters by tab, asking the server for that source", async () => {
    const seen = mediaRequests();
    const { user } = openLibrary();
    await screen.findByText("4 files");
    await user.click(screen.getByRole("button", { name: "Generated" }));
    await waitFor(() => expect(tiles()).toEqual(["Image: A red apple on a table", "Image: A cat asleep on a windowsill"]));
    expect(seen.at(-1)!.searchParams.get("source")).toBe("generated");
    expect(screen.getByRole("button", { name: "Generated" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "My Uploads" }));
    await waitFor(() => expect(tiles()).toEqual(["Image: beach.jpg", "Video: waves.mp4"]));
    expect(seen.at(-1)!.searchParams.get("source")).toBe("upload");
    // the count is the whole library's, whatever the tab
    expect(screen.getByText("4 files")).toBeInTheDocument();
  });

  it("searches names and prompts from 3 characters; fewer, or none, shows everything", async () => {
    const seen = mediaRequests();
    const { user } = openLibrary();
    await screen.findByText("4 files");
    const box = screen.getByRole("searchbox", { name: "Search assets" });
    await user.type(box, "ca");
    await new Promise((r) => setTimeout(r, 400));
    expect(seen.every((url) => !url.searchParams.has("q"))).toBe(true);
    expect(tiles()).toHaveLength(4);

    await user.type(box, "t");
    await waitFor(() => expect(tiles()).toEqual(["Image: A cat asleep on a windowsill"]));
    expect(seen.at(-1)!.searchParams.get("q")).toBe("cat");

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(tiles()).toHaveLength(4));
  });

  it("says when a search finds nothing, and clears it", async () => {
    const { user } = openLibrary();
    await screen.findByText("4 files");
    await user.type(screen.getByRole("searchbox", { name: "Search assets" }), "zqxjkvw");
    expect(await screen.findByText("No assets found")).toBeInTheDocument();
    expect(screen.getByText(`No results match "zqxjkvw". Try a different filename, prompt, or clear the search.`)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear search" }).at(-1)!);
    await waitFor(() => expect(tiles()).toHaveLength(4));
  });

  it("says when there are no uploads yet", async () => {
    getMockDb().media = library().filter((asset) => asset.source === "generated");
    const { user } = openLibrary();
    await screen.findByText("2 files");
    await user.click(screen.getByRole("button", { name: "My Uploads" }));
    expect(await screen.findByText("No uploaded assets yet")).toBeInTheDocument();
    expect(screen.getByText("Upload files using the Upload button or drag & drop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload files" })).toBeInTheDocument();
  });

  it("loads the next page when the grid is scrolled to its end", async () => {
    getMockDb().media = Array.from({ length: 60 }, (_, i) => ({ ...library()[0], id: `m-${i}`, name: `photo-${i}.jpg`, createdAt: hoursAgo(1 + i / 100) }));
    const seen = mediaRequests();
    openLibrary();
    await waitFor(() => expect(tiles()).toHaveLength(50));
    const grid = screen.getByRole("region", { name: "Today" }).parentElement!;
    Object.defineProperties(grid, {
      scrollHeight: { configurable: true, value: 3000 },
      clientHeight: { configurable: true, value: 470 },
      scrollTop: { configurable: true, value: 2400 },
    });
    fireEvent.scroll(grid);
    await waitFor(() => expect(tiles()).toHaveLength(60));
    expect(seen.at(-1)!.searchParams.get("cursor")).toBe("50");
  });

  it("picks a file on click", async () => {
    const { user, onPick } = openLibrary();
    await user.click(await screen.findByRole("button", { name: "Image: beach.jpg" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "m-beach", name: "beach.jpg" }));
  });

  it("shows magica's other controls, which do nothing here", async () => {
    openLibrary();
    await screen.findByText("4 files");
    for (const name of ["Favorites", "Sort media library by Newest First", "Filter", "Grid view", "List view", "All", "My folders"]) {
      const control = screen.getAllByRole("button", { name }).find((b) => b.getAttribute("aria-disabled") === "true");
      expect(control, name).toHaveAttribute("title", "Not available in this build");
    }
  });

  it("says when it can't load, and tries again", async () => {
    let fail = true;
    server.use(http.get(`${BACKEND_URL}/api/media`, () => (fail ? HttpResponse.json({ error: "down", code: "INTERNAL_ERROR" }, { status: 500 }) : undefined)));
    const { user } = openLibrary();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your media.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(tiles()).toHaveLength(4));
  });

  it("uploads from its own Upload media button, and the new file shows in My Uploads", async () => {
    const { user } = openLibrary();
    await screen.findByText("4 files");
    await user.click(screen.getByRole("button", { name: "My Uploads" }));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const input = screen.getByLabelText("Upload files to media library", { selector: "input" });
    await user.upload(input, new File([new Uint8Array(10)], "sunset.png", { type: "image/png" }));
    await waitFor(() => expect(tiles()).toContain("Image: sunset.png"));
    expect(screen.getByText("5 files")).toBeInTheDocument();
  });

  it("doesn't put focus in the search box when it opens (the dialog takes it, as on magica)", async () => {
    openLibrary();
    await screen.findByText("4 files");
    const dialog = screen.getByRole("dialog", { name: "Media Library" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole("searchbox", { name: "Search assets" })).not.toHaveFocus();
  });

  it("holds the grid and list buttons in one switch, with the grid chosen", async () => {
    openLibrary();
    await screen.findByText("4 files");
    const grid = screen.getByRole("button", { name: "Grid view" });
    const list = screen.getByRole("button", { name: "List view" });
    expect(grid.parentElement).toBe(list.parentElement);
    expect(grid).toHaveAttribute("aria-pressed", "true");
    expect(list).toHaveAttribute("aria-pressed", "false");
  });

  it("closes from its close button", async () => {
    const { user, onOpenChange } = openLibrary();
    await user.click(await screen.findByRole("button", { name: "Close media library" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
