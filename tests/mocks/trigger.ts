import { useSyncExternalStore } from "react";

// A stand-in for Trigger.dev's realtime hooks. Tests push stream chunks, set the run's status and
// metadata, or make the connection fail, and see what the app does. Nothing leaves the test.
interface Subscription {
  runId: string;
  accessToken?: string;
  id?: string;
}

interface State {
  parts: unknown[];
  streamError?: Error;
  runError?: Error;
  run?: { status: string; metadata?: Record<string, unknown> };
}

let state: State = { parts: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const realtime = {
  // every subscription the app opened, newest last
  subscriptions: [] as Subscription[],
  push(...parts: unknown[]) {
    state = { ...state, parts: [...state.parts, ...parts] };
    emit();
  },
  failStream(error = new Error("stream dropped")) {
    state = { ...state, streamError: error };
    emit();
  },
  recover() {
    state = { ...state, streamError: undefined, runError: undefined };
    emit();
  },
  setRun(run: State["run"]) {
    state = { ...state, run };
    emit();
  },
  reset() {
    state = { parts: [] };
    realtime.subscriptions = [];
    emit();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const useState = () => useSyncExternalStore(subscribe, () => state);

type Options = { accessToken?: string; enabled?: boolean; id?: string };

function track(runId: string, options: Options) {
  const last = realtime.subscriptions.at(-1);
  if (options.enabled && (!last || last.runId !== runId || last.id !== options.id)) {
    realtime.subscriptions.push({ runId, accessToken: options.accessToken, id: options.id });
  }
}

const NO_PARTS: unknown[] = [];

export const triggerModule = {
  useRealtimeStream(runId: string, _key: string, options: Options = {}) {
    const current = useState();
    track(runId, options);
    const on = !!options.enabled;
    return { parts: on ? current.parts : NO_PARTS, error: on ? current.streamError : undefined, lastEventId: undefined, stop: () => {} };
  },
  useRealtimeRun(_runId: string, options: Options = {}) {
    const current = useState();
    const on = !!options.enabled;
    return { run: on ? current.run : undefined, error: on ? current.runError : undefined, stop: () => {} };
  },
};
