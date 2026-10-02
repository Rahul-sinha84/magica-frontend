// How often a run in flight is checked when there is no live stream (it failed, or there is no token).
export const RUN_POLL_MS = 2000;
// While the live stream is working, the server is still asked now and then: it alone says when a run is over.
export const LIVE_POLL_MS = 10_000;
// A new stream token is fetched this long before the current one expires.
export const TOKEN_REFRESH_LEAD_MS = 30_000;
// After the live stream fails, wait this long before trying it again (polling covers the gap).
export const REALTIME_RETRY_MS = 30_000;
// A turn still waiting in the queue after this long gets a note saying so (most start well before).
export const QUEUED_NOTICE_MS = 10_000;
