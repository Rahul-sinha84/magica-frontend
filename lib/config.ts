// `||` (not `??`) so an empty value in .env falls back too; a trailing slash would double up in paths.
// Trigger.dev's API, for live streaming. Unset means Trigger.dev's cloud, which is where the backend runs its tasks.
export const TRIGGER_API_URL = process.env.NEXT_PUBLIC_TRIGGER_API_URL || undefined;
// The mock backend can't fake Trigger.dev's live stream, so mock mode follows runs by polling only.
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_API_MOCKING !== "true";
export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");

// The hosted API reference (the backend's Mintlify docs), which the API Keys dialog links to. Unset (or not a web
// address), the link stays disabled.
export function docsUrl(value = process.env.NEXT_PUBLIC_DOCS_URL) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
