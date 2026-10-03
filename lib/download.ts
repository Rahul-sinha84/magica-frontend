// Saving generated media to the device.

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// The name a file is saved under: the last part of its address when that names a file, else "magica-2.png".
export function fileNameFor(url: string, index: number, mimeType?: string) {
  try {
    const last = decodeURIComponent(new URL(url, "https://x").pathname.split("/").pop() ?? "");
    if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
  } catch {}
  return `magica-${index + 1}.${(mimeType && EXTENSIONS[mimeType]) || (mimeType?.startsWith("video/") ? "mp4" : "png")}`;
}

function clickLink(href: string, name: string, newTab = false) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  if (newTab) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// One file: fetched and saved under its name. A file whose server doesn't let this page fetch it is handed to the
// browser instead, which saves it (or opens it, if the server won't allow a download from here).
export async function downloadFile(url: string, name: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const href = URL.createObjectURL(await response.blob());
    clickLink(href, name);
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    clickLink(url, name, true);
  }
}

// Several, one after another: a browser may refuse a burst of downloads started at once.
export async function downloadFiles(files: readonly { url: string; name: string }[], gapMs = 300) {
  for (const [i, file] of files.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
    await downloadFile(file.url, file.name);
  }
}
