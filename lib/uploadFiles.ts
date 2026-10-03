import { UPLOAD_TYPES, UploadFileSchema, type ImageBlock, type MediaAsset, type UploadFile, type UploadMimeType, type VideoBlock } from "@/contracts";

const extensionOf = (name: string) => /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";

// What the file input accepts: every allowed type, and its extensions (some browsers go by one, some the other).
export const UPLOAD_ACCEPT = [
  ...Object.keys(UPLOAD_TYPES),
  ...new Set(Object.values(UPLOAD_TYPES).flatMap((extensions) => extensions.map((extension) => `.${extension}`))),
].join(",");

// The file's type as the server will judge it: the browser's own (without parameters), or, when the browser has
// none (some give HEIC files an empty type), the first type its extension belongs to.
export function mimeTypeOf(file: Pick<File, "name" | "type">): string {
  const given = file.type.split(";")[0]?.trim().toLowerCase();
  if (given) return given;
  const extension = extensionOf(file.name);
  const found = (Object.entries(UPLOAD_TYPES) as [UploadMimeType, readonly string[]][]).find(([, extensions]) => extensions.includes(extension));
  return found?.[0] ?? "";
}

export type FileCheck = { ok: true; upload: UploadFile } | { ok: false; reason: string };

// The same checks the server makes (size, type, a name that matches the type), with its words, so a file that
// would be refused never leaves the browser.
export function checkFile(file: Pick<File, "name" | "size" | "type">): FileCheck {
  const parsed = UploadFileSchema.safeParse({ name: file.name, size: file.size, mimeType: mimeTypeOf(file) });
  return parsed.success ? { ok: true, upload: parsed.data } : { ok: false, reason: parsed.error.issues[0]?.message ?? "This file can't be attached." };
}

export function kindOf(mimeType: string): "image" | "video" | "audio" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

// file extensions a media URL can be trusted to name the type by
const URL_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "mp3", "wav", "m4a"]);

function urlExtension(url: string) {
  try {
    const extension = extensionOf(new URL(url, "https://x").pathname);
    return URL_EXTENSIONS.has(extension) ? extension : "";
  } catch {
    return "";
  }
}

// The short type shown on a library tile: PNG, MP4, MP3… From the file's name, else its type, else (media whose
// service reports no type, like crop results) the extension in its address. Empty when none of them says.
export function typeLabel(mimeType: string | null, name: string | null, url?: string) {
  const fromName = name ? extensionOf(name) : "";
  if (fromName) return fromName.toUpperCase();
  const subtype = mimeType?.split("/")[1]?.split(";")[0] ?? "";
  const known: Record<string, string> = { jpeg: "JPG", quicktime: "MOV", mpeg: "MP3", "x-wav": "WAV", wave: "WAV", "x-m4a": "M4A" };
  if (subtype) return (known[subtype] ?? subtype).toUpperCase();
  return url ? urlExtension(url).toUpperCase() : "";
}

// A library file as the preview dialog shows it (audio has no preview).
export function previewBlock(asset: MediaAsset): ImageBlock | VideoBlock | null {
  if (asset.type === "audio") return null;
  const fields = {
    url: asset.url,
    mimeType: asset.mimeType ?? undefined,
    altText: asset.name ?? asset.prompt ?? undefined,
    prompt: asset.prompt ?? undefined,
    model: asset.model ?? undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
  };
  return asset.type === "video" ? { type: "video", ...fields } : { type: "image", ...fields };
}
