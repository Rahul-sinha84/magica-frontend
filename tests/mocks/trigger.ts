import { useEffect, useState as useReactState, useSyncExternalStore } from "react";

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

// As Trigger.dev's hooks do: a subscription starts when the run or `enabled` changes, NOT when the id or the
// token does, and what it receives is kept under the id it started with. Read under another id, the hook has
// nothing (its slot is empty, while the old subscription carries on elsewhere).
function useSubscription(runId: string, options: Options, record: boolean) {
  const [startedWith, setStartedWith] = useReactState<string | null>(null);
  const { enabled, id = "", accessToken } = options;
  useEffect(() => {
    if (!enabled || !runId) return;
    if (record) realtime.subscriptions.push({ runId, accessToken, id: options.id });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standing in for the subscription starting
    setStartedWith(id);
    return () => setStartedWith(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not restarted for a new id or token, like the real hooks
  }, [runId, enabled]);
  return !!enabled && startedWith === id;
}

const NO_PARTS: unknown[] = [];

export const triggerModule = {
  useRealtimeStream(runId: string, _key: string, options: Options = {}) {
    const current = useState();
    const on = useSubscription(runId, options, true);
    return { parts: on ? current.parts : NO_PARTS, error: on ? current.streamError : undefined, lastEventId: undefined, stop: () => {} };
  },
  useRealtimeRun(runId: string, options: Options = {}) {
    const current = useState();
    const on = useSubscription(runId, options, false);
    return { run: on ? current.run : undefined, error: on ? current.runError : undefined, stop: () => {} };
  },
};
