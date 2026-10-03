import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import { getMockDb } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { transloadit } from "../mocks/transloadit";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

// a processing upload is asked about again quickly here
vi.mock("@/lib/timing", async (original) => ({ ...(await original<typeof import("@/lib/timing")>()), UPLOAD_POLL_MS: 20, UPLOAD_POLL_LIMIT_MS: 400 }));
stubLayout();
afterEach(() => server.events.removeAllListeners());

const at = (path: string) => `${BACKEND_URL}${path}`;
const png = (name = "photo.png", size = 1000) => new File([new Uint8Array(size)], name, { type: "image/png" });

function requests(method: string, path: RegExp) {
  const seen: { url: URL; body: unknown }[] = [];
  server.events.on("request:start", async ({ request }) => {
    const url = new URL(request.url);
    if (request.method === method && path.test(url.pathname)) seen.push({ url, body: await request.clone().json().catch(() => null) });
  });
  return seen;
}

async function openChat() {
  const view = renderApp(<ChatWindow chatId="chat-greeting" />);
  await screen.findByText("Hi! What can I help you with today?");
  const input = screen.getByLabelText("Upload files") as HTMLInputElement;
  return { ...view, input };
}

const chips = () => within(screen.getByRole("list", { name: "Attachments" })).getAllByRole("listitem");
const chip = (name: string) => screen.getByRole("button", { name: `Remove attachment: ${name}` }).closest("li")!;
const send = () => screen.getByRole("button", { name: "Send message" });
const box = () => screen.getByPlaceholderText("Send a message…");

describe("the paperclip", () => {
  it("opens a card with Select Asset and Upload, and closes with Escape", async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    expect(await screen.findByText("Add a file from your device or select one from your library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Asset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/Add a file from your device/)).not.toBeInTheDocument());
  });

  it("uploads through a file input that takes many images, videos and audio files", async () => {
    const { user, input } = await openChat();
    expect(input).toHaveAttribute("type", "file");
    expect(input.multiple).toBe(true);
    for (const type of ["image/png", "image/heic", "video/mp4", "audio/mpeg", ".heic", ".mov", ".m4a"]) expect(input.accept.split(",")).toContain(type);
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    await user.click(await screen.findByRole("button", { name: "Upload" }));
    expect(click).toHaveBeenCalled();
  });

  it.each([
    // the paperclip low on the screen (a task, or the unscrolled home screen): more room above, so above it
    [600, "top"],
    // the composer scrolled up near the top: more room below
    [120, "bottom"],
  ])("opens on the side with more room (paperclip at %ipx: %s)", async (top, side) => {
    const { user } = await openChat();
    const clip = screen.getByRole("button", { name: "Attach files" });
    vi.spyOn(clip, "getBoundingClientRect").mockReturnValue({ top, bottom: top + 32, left: 400, right: 432, width: 32, height: 32, x: 400, y: top, toJSON: () => ({}) });
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    await user.click(clip);
    const card = (await screen.findByText(/Add a file from your device/)).parentElement!;
    expect(card).toHaveAttribute("data-side", side);
  });

  it("its Upload button is dark in both themes, as on magica", async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    const upload = await screen.findByRole("button", { name: "Upload" });
    expect(upload).toHaveClass("bg-[#2b2b2b]", "text-white");
    expect(upload.className).not.toMatch(/dark:bg-/);
  });

  it("opens the media library from Select Asset", async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    await user.click(await screen.findByRole("button", { name: "Select Asset" }));
    expect(await screen.findByRole("dialog", { name: "Media Library" })).toBeInTheDocument();
  });
});

describe("uploading", () => {
  it("shows the progress in the chip, then the file is ready and sending is allowed", async () => {
    transloadit.hold = true;
    const signed = requests("POST", /^\/api\/uploads$/);
    const { user, input } = await openChat();
    await user.type(box(), "What is in this photo?");
    await user.upload(input, png());
    await waitFor(() => expect(transloadit.uploads).toHaveLength(1));
    expect(signed[0].body).toEqual({ files: [{ name: "photo.png", size: 1000, mimeType: "image/png" }] });
    expect(chip("photo.png")).toHaveTextContent("Uploading, 0%");
    expect(send()).toBeDisabled();

    transloadit.progress(0, 0.5);
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Uploading, 50%"));
    transloadit.finish(0);
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Ready"));
    expect(send()).toBeEnabled();
  });

  it("asks again while the server is still processing the file", async () => {
    let pending = 2;
    server.use(
      http.post(at("/api/uploads/:uploadId/complete"), () =>
        pending-- > 0 ? HttpResponse.json({ upload: { id: "x", status: "pending", errorMessage: null, asset: null } }) : undefined,
      ),
    );
    const completes = requests("POST", /\/complete$/);
    const { user, input } = await openChat();
    await user.upload(input, png());
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Ready"));
    expect(completes).toHaveLength(3);
    expect(completes[0].body).toEqual({ assemblyId: expect.stringMatching(/^[0-9a-f]{32}$/) });
  });

  it("gives up after a while of processing, and Retry asks again", async () => {
    let stillProcessing = true;
    server.use(
      http.post(at("/api/uploads/:uploadId/complete"), () =>
        stillProcessing ? HttpResponse.json({ upload: { id: "x", status: "pending", errorMessage: null, asset: null } }) : undefined,
      ),
    );
    const { user, input } = await openChat();
    await user.upload(input, png());
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("taking too long"), { timeout: 2000 });
    stillProcessing = false;
    await user.click(screen.getByRole("button", { name: "Retry upload: photo.png" }));
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Ready"));
  });

  it("shows why a file failed, and uploads it again on Retry", async () => {
    let failOnce = true;
    server.use(
      http.post(at("/api/uploads/:uploadId/complete"), () => {
        if (!failOnce) return undefined;
        failOnce = false;
        return HttpResponse.json({ upload: { id: "x", status: "failed", errorMessage: "This file is damaged and can't be used.", asset: null } });
      }),
    );
    const { user, input } = await openChat();
    await user.upload(input, png());
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Failed: This file is damaged and can't be used."));
    await user.click(screen.getByRole("button", { name: "Retry upload: photo.png" }));
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Ready"));
  });

  it("retries an upload that didn't get through, with a new upload", async () => {
    transloadit.hold = true;
    const { user, input } = await openChat();
    await user.upload(input, png());
    await waitFor(() => expect(transloadit.uploads).toHaveLength(1));
    transloadit.fail(0);
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Failed: The upload didn't finish"));
    transloadit.hold = false;
    await user.click(screen.getByRole("button", { name: "Retry upload: photo.png" }));
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Ready"));
    expect(transloadit.uploads).toHaveLength(2);
  });

  it("stops an upload and drops its chip on ×", async () => {
    transloadit.hold = true;
    const { user, input } = await openChat();
    await user.upload(input, png());
    await waitFor(() => expect(transloadit.uploads).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Remove attachment: photo.png" }));
    expect(screen.queryByRole("list", { name: "Attachments" })).not.toBeInTheDocument();
    expect(transloadit.uploads[0].cancelled).toBe(true);
  });

  it("works out a HEIC file's type from its name when the browser gives none", async () => {
    const signed = requests("POST", /^\/api\/uploads$/);
    const { user, input } = await openChat();
    await user.upload(input, new File([new Uint8Array(10)], "IMG_0001.HEIC", { type: "" }));
    await waitFor(() => expect(signed).toHaveLength(1));
    expect(signed[0].body).toEqual({ files: [{ name: "IMG_0001.HEIC", size: 10, mimeType: "image/heic" }] });
  });

  it("refuses a file that isn't an image, video or audio, or is too big, before uploading", async () => {
    const signed = requests("POST", /^\/api\/uploads$/);
    const { input } = await openChat();
    const huge = png("huge.png");
    Object.defineProperty(huge, "size", { value: 600_000_000 });
    const { fireEvent } = await import("@testing-library/react");
    // the picker's own filter is bypassed, as a drag or an "All files" choice would
    fireEvent.change(input, { target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" }), huge] } });
    expect(await screen.findByText("Couldn't attach notes.txt")).toBeInTheDocument();
    expect(screen.getByText("Only images, videos and audio can be attached.")).toBeInTheDocument();
    expect(screen.getByText("Couldn't attach huge.png")).toBeInTheDocument();
    expect(screen.getByText("Files can be at most 500 MB.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Attachments" })).not.toBeInTheDocument();
    expect(signed).toHaveLength(0);
  });

  it("takes at most 10 files, and says so", async () => {
    const { user, input } = await openChat();
    await user.upload(input, Array.from({ length: 11 }, (_, i) => png(`photo-${i}.png`)));
    expect(await screen.findByText("A message can carry at most 10 files.")).toBeInTheDocument();
    expect(chips()).toHaveLength(10);
  });

  it("shows the server's reason when it won't take uploads", async () => {
    server.use(
      http.post(at("/api/uploads"), () =>
        HttpResponse.json({ error: "This month's upload allowance is used up. Uploads resume on November 1.", code: "UPLOAD_LIMIT_REACHED" }, { status: 429 }),
      ),
    );
    const { user, input } = await openChat();
    await user.upload(input, png());
    await waitFor(() => expect(chip("photo.png")).toHaveTextContent("Failed: This month's upload allowance is used up. Uploads resume on November 1."));
  });

  it("marks only the file the server refused in a batch, and uploads the others", async () => {
    let once = true;
    server.use(
      http.post(at("/api/uploads"), () => {
        if (!once) return undefined;
        once = false;
        return HttpResponse.json({ error: "files.0.name: This file's name doesn't match its type.", code: "VALIDATION_FAILED" }, { status: 400 });
      }),
    );
    const { user, input } = await openChat();
    await user.upload(input, [png("first.png"), png("second.png")]);
    await waitFor(() => expect(chip("first.png")).toHaveTextContent("Failed: This file's name doesn't match its type."));
    await waitFor(() => expect(chip("second.png")).toHaveTextContent("Ready"));
  });
});

describe("sending with files", () => {
  async function pickFromLibrary(user: Awaited<ReturnType<typeof openChat>>["user"], tile: string | RegExp) {
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    await user.click(await screen.findByRole("button", { name: "Select Asset" }));
    await user.click(await screen.findByRole("button", { name: tile }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Media Library" })).not.toBeInTheDocument());
  }

  it("sends the files in chip order, library picks and uploads mixed, and the chips clear", async () => {
    const sent = requests("POST", /\/messages$/);
    const { user, input } = await openChat();
    await pickFromLibrary(user, "Image: beach.jpg");
    await user.upload(input, png("new.png"));
    await pickFromLibrary(user, /^Image: A single fresh red apple/);
    await waitFor(() => expect(chips().map((li) => within(li).getByRole("button", { name: /Remove attachment/ }).getAttribute("aria-label"))).toEqual([
      "Remove attachment: beach.jpg",
      "Remove attachment: new.png",
      `Remove attachment: ${getMockDb().media.find((m) => m.id === "media-apple")!.prompt}`,
    ]));
    await waitFor(() => expect(chip("new.png")).toHaveTextContent("Ready"));
    const uploaded = getMockDb().media.find((m) => m.name === "new.png")!;

    await user.type(box(), "Compare these{Enter}");
    await waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0].body as { attachments: unknown }).attachments).toEqual([{ mediaAssetId: "media-beach" }, { mediaAssetId: uploaded.id }, { mediaAssetId: "media-apple" }]);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Attachments" })).not.toBeInTheDocument());
    // the message shows its files, in order
    const files = await screen.findByRole("list", { name: "Attached files" });
    expect(within(files).getAllByRole("listitem")).toHaveLength(3);
  });

  it("marks a file the server says has expired, and gives the text and files back", async () => {
    const { user } = await openChat();
    await pickFromLibrary(user, "Image: beach.jpg");
    // the upload service deleted it since it was picked
    getMockDb().media.find((m) => m.id === "media-beach")!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await user.type(box(), "Look at this{Enter}");
    await waitFor(() => expect(chip("beach.jpg")).toHaveTextContent("This file has expired. Upload it again."));
    // the toast gives the reason without the server's field name (the chip shows which file)
    expect(await screen.findByText("Message not sent")).toBeInTheDocument();
    expect(screen.getByText("This file has expired. Upload it again.", { selector: "[data-description]" })).toBeInTheDocument();
    expect(screen.queryByText(/attachments\.0:/)).not.toBeInTheDocument();
    expect(box()).toHaveValue("Look at this");
    expect(send()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove attachment: beach.jpg" }));
    expect(send()).toBeEnabled();
  });
});

describe("a file the server won't take when sending", () => {
  it("is marked with the reason and can only be removed", async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    await user.click(await screen.findByRole("button", { name: "Select Asset" }));
    await user.click(await screen.findByRole("button", { name: "Image: beach.jpg" }));
    // deleted from the library in the meantime
    getMockDb().media = getMockDb().media.filter((m) => m.id !== "media-beach");
    await user.type(box(), "Look{Enter}");
    await waitFor(() => expect(chip("beach.jpg")).toHaveTextContent("Failed: That file isn't in your library."));
    expect(screen.queryByRole("button", { name: "Retry upload: beach.jpg" })).not.toBeInTheDocument();
    expect(send()).toBeDisabled();
  });
});
