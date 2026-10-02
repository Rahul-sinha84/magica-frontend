import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/contracts";
import { UPLOAD_ACCEPT, checkFile, kindOf, mimeTypeOf, previewBlock, typeLabel } from "@/lib/uploadFiles";

const file = (name: string, type: string, size = 100) => ({ name, type, size });

describe("files to upload", () => {
  it("accepts every type the backend takes, and their extensions", () => {
    const accepted = UPLOAD_ACCEPT.split(",");
    for (const [type, extensions] of Object.entries(UPLOAD_TYPES)) {
      expect(accepted).toContain(type);
      for (const extension of extensions) expect(accepted).toContain(`.${extension}`);
    }
  });

  it("works out a type the browser didn't give from the extension, and tidies one it did", () => {
    expect(mimeTypeOf(file("IMG_0001.HEIC", ""))).toBe("image/heic");
    expect(mimeTypeOf(file("song.wav", ""))).toBe("audio/wav");
    expect(mimeTypeOf(file("photo.png", ""))).toBe("image/png");
    expect(mimeTypeOf(file("clip.mov", "Video/QuickTime; codecs=x"))).toBe("video/quicktime");
    expect(mimeTypeOf(file("notes", ""))).toBe("");
  });

  it("refuses what the server would, in its words", () => {
    expect(checkFile(file("photo.png", "image/png"))).toMatchObject({ ok: true, upload: { name: "photo.png", size: 100, mimeType: "image/png" } });
    expect(checkFile(file("notes.txt", "text/plain"))).toEqual({ ok: false, reason: "Only images, videos and audio can be attached." });
    expect(checkFile(file("big.mp4", "video/mp4", MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, reason: "Files can be at most 500 MB." });
    expect(checkFile(file("empty.png", "image/png", 0))).toEqual({ ok: false, reason: "This file is empty." });
    expect(checkFile(file("photo.jpg", "image/png"))).toEqual({ ok: false, reason: "This file's name doesn't match its type." });
  });

  it("names the kind of file and its short type", () => {
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("audio/x-m4a")).toBe("audio");
    expect(kindOf("image/heic")).toBe("image");
    expect(typeLabel("image/png", "api-crop-image.png")).toBe("PNG");
    expect(typeLabel("image/jpeg", null)).toBe("JPG");
    expect(typeLabel("video/quicktime", null)).toBe("MOV");
  });

  it("falls back to the address's extension when there's no name or type, and shows nothing when that is unknown", () => {
    expect(typeLabel(null, null, "https://cdn.example.com/crops/abc123.webp")).toBe("WEBP");
    expect(typeLabel(null, null, "https://cdn.example.com/out/clip.MP4?sig=x")).toBe("MP4");
    expect(typeLabel(null, null, "https://cdn.example.com/out/abc123")).toBe("");
    expect(typeLabel(null, null, "https://cdn.example.com/out/notes.txt")).toBe("");
  });

  it("turns a library file into what the preview shows, and audio into nothing", () => {
    const asset = {
      id: "a", source: "generated" as const, type: "image" as const, url: "/a.png", name: null, prompt: "A cat", model: "GPT Image 2",
      width: 1024, height: 768, mimeType: "image/png", createdAt: "2026-10-01T10:00:00Z", expiresAt: null,
    };
    expect(previewBlock(asset)).toEqual({ type: "image", url: "/a.png", mimeType: "image/png", altText: "A cat", prompt: "A cat", model: "GPT Image 2", width: 1024, height: 768 });
    expect(previewBlock({ ...asset, type: "audio" })).toBeNull();
  });
});
