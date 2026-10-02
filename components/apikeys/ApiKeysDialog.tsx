"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { BookOpen, CalendarDays, Check, ChevronDown, Copy, ExternalLink, Gauge, KeyRound, Pencil, Plus, Trash2, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";
import { API_KEY_LIMITS, CreateApiKeyBodySchema, type ApiKey, type CreateApiKeyBody } from "@/contracts";
import { keyError, useApiKeyActions, useApiKeys } from "@/hooks/useApiKeys";
import { cn } from "@/lib/utils";
import { useApiKeysDialog } from "@/stores/uiStore";

const INERT = "Not available in this build";
const DEFAULT_LABEL = "Default";
const MASK = "••••••••";

const field =
  "h-[42px] rounded-[10px] border border-[#d9d9d9] bg-surface-main font-medium text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-[#8a8a8a] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-main aria-invalid:border-destructive dark:border-line-secondary";
const pill =
  "inline-flex h-9 shrink-0 items-center justify-center gap-[7px] rounded-full px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#8a8a8a] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-main disabled:cursor-default disabled:opacity-50";
const dark = cn(pill, "bg-primary text-[#f7f7f7] hover:bg-primary/90");
const quiet = cn(pill, "text-[#5e5e5e] hover:bg-surface-secondary dark:text-text-secondary");
const round =
  "flex size-7 shrink-0 items-center justify-center rounded-full text-text-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";
const chip = "inline-flex h-5 items-center rounded-[4px] bg-surface-secondary px-2 text-xs font-medium text-text-secondary";
const panel = "rounded-[4px] border-[0.5px] border-line-tertiary bg-surface-main p-3";

const fmt = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => format(new Date(iso), "M/d/yyyy");

// ---- limits ----

interface LimitsText {
  perMinute: string;
  perDay: string;
}

const DEFAULT_LIMITS: LimitsText = { perMinute: String(API_KEY_LIMITS.perMinute.default), perDay: String(API_KEY_LIMITS.perDay.default) };

// The contract's ranges, checked before anything is sent, with what is wrong said plainly.
function readLimits(text: LimitsText): { perMinute: number; perDay: number } | string {
  const read = (value: string, { min, max }: { min: number; max: number }, what: string) => {
    const n = Number(value.trim());
    return /^\d+$/.test(value.trim()) && n >= min && n <= max ? n : `${what} must be a whole number from ${fmt(min)} to ${fmt(max)}.`;
  };
  const perMinute = read(text.perMinute, API_KEY_LIMITS.perMinute, "Requests per minute");
  if (typeof perMinute === "string") return perMinute;
  const perDay = read(text.perDay, API_KEY_LIMITS.perDay, "Requests per day");
  if (typeof perDay === "string") return perDay;
  return { perMinute, perDay };
}

// magica's two limit fields: per minute (with its gauge), and per day with its ceiling beside it.
function LimitFields({ value, onChange, invalid }: { value: LimitsText; onChange: (next: LimitsText) => void; invalid?: boolean }) {
  const id = useId();
  const number = cn(field, "px-2 text-xs");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-1.5">
        <Gauge className="size-3 text-text-secondary" aria-hidden="true" />
        <label htmlFor={`${id}-minute`} className="text-xs font-medium text-text-secondary">
          Per min
        </label>
        <input
          id={`${id}-minute`}
          type="number"
          inputMode="numeric"
          min={API_KEY_LIMITS.perMinute.min}
          max={API_KEY_LIMITS.perMinute.max}
          step={1}
          value={value.perMinute}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange({ ...value, perMinute: event.target.value })}
          className={cn(number, "w-20")}
        />
        <span className="text-[10px] leading-3 text-text-secondary">max {fmt(API_KEY_LIMITS.perMinute.max)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <label htmlFor={`${id}-day`} className="text-xs font-medium text-text-secondary">
          Per day
        </label>
        <input
          id={`${id}-day`}
          type="number"
          inputMode="numeric"
          min={API_KEY_LIMITS.perDay.min}
          max={API_KEY_LIMITS.perDay.max}
          step={1}
          value={value.perDay}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange({ ...value, perDay: event.target.value })}
          className={cn(number, "w-24")}
        />
        <span className="text-[10px] leading-3 text-text-secondary">max {fmt(API_KEY_LIMITS.perDay.max)}</span>
      </div>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

// An editor in a row, as magica does it: Enter saves, Escape puts the row back (and goes no further, so the
// dialog stays open).
function InlineEditor({ onSubmit, onCancel, className, children }: { onSubmit: () => void; onCancel: () => void; className?: string; children: ReactNode }) {
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onCancel();
  }
  return (
    <form
      data-inline-editor=""
      // our own checks, with the contract's ranges said plainly, rather than the browser's
      noValidate
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={className}
    >
      {children}
    </form>
  );
}

// ---- the key just made ----

// The key itself, once: with a copy button and the warning that it can't be seen again. It lives only here, so it
// is gone when this is dismissed or the dialog closes.
function NewKey({ secret, label, onDone }: { secret: string; label: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => copyRef.current?.focus(), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  }
  return (
    <section aria-label="New API key" className={cn(panel, "mt-3")}>
      <p className="text-xs font-medium text-text-primary">“{label}” is ready. Copy it now</p>
      <p className="text-[10px] leading-3 text-text-secondary">You won&apos;t be able to see this key again. Keep it somewhere safe.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-[10px] border border-[#d9d9d9] bg-surface-main-2 px-3 py-2.5 font-mono text-xs text-text-primary dark:border-line-secondary">
          {secret}
        </code>
        <button ref={copyRef} type="button" onClick={copy} className={cn(pill, "border border-line-secondary bg-surface-main text-text-primary hover:bg-surface-primary")}>
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onDone} className={quiet}>
          Done
        </button>
      </div>
    </section>
  );
}

// ---- creating ----

// the end of the chosen day, where the viewer is
const endOfDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};

function CreateKey({ activeCount, maxActive, ready }: { activeCount: number; maxActive: number; ready: boolean }) {
  const { create } = useApiKeyActions();
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [advanced, setAdvanced] = useState(false);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ secret: string; label: string } | null>(null);
  const full = ready && activeCount >= maxActive;
  const advancedId = useId();
  const today = format(new Date(), "yyyy-MM-dd");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (full || !ready || create.isPending) return;
    const read = readLimits(limits);
    if (typeof read === "string") {
      setAdvanced(true);
      return setError(read);
    }
    if (expires && endOfDay(expires).getTime() <= Date.now()) return setError("Choose a date in the future.");
    // the contract's own check, so nothing it would refuse is sent
    const body = CreateApiKeyBodySchema.safeParse({ label, ...read, ...(expires && { expiresAt: endOfDay(expires).toISOString() }) });
    if (!body.success) return setError(body.error.issues[0]?.message ?? "Check the key's details.");
    setError(null);
    create.mutate(body.data satisfies CreateApiKeyBody, {
      onSuccess: ({ secret, apiKey }) => {
        setCreated({ secret, label: apiKey.label });
        setLabel(DEFAULT_LABEL);
        setLimits(DEFAULT_LIMITS);
        setExpires("");
      },
      onError: (failure) => setError(keyError(failure)),
    });
  }

  return (
    <div className="rounded-[10px] border-[0.5px] border-line-secondary bg-surface-main-2 p-4">
      <form onSubmit={submit} noValidate>
        <h3 className="text-sm font-semibold text-text-primary">Create a new key</h3>
        <p className="text-xs font-medium text-text-secondary">Add a recognizable label so you can identify this key later.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="api-key-label" className="sr-only">
            Key label
          </label>
          <input
            id="api-key-label"
            value={label}
            maxLength={64}
            placeholder="e.g. Production app"
            onChange={(event) => setLabel(event.target.value)}
            aria-invalid={!!error || undefined}
            className={cn(field, "w-full min-w-0 px-3 text-sm sm:flex-1")}
          />
          <button type="submit" disabled={full || !ready || create.isPending} className={dark}>
            <Plus className="size-3.5" aria-hidden="true" />
            {create.isPending ? "Creating…" : "Create key"}
          </button>
        </div>
        {full && (
          <p className="mt-2 text-xs text-text-secondary">
            You can have at most {maxActive} active API keys. Revoke one to create another.
          </p>
        )}
        {error && (
          <div className="mt-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <button
          type="button"
          aria-expanded={advanced}
          aria-controls={advancedId}
          onClick={() => setAdvanced((open) => !open)}
          className="mt-4 flex items-center gap-1.5 rounded-md text-xs font-medium text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn("size-3 transition-transform", advanced && "rotate-180")} aria-hidden="true" />
          Advanced options
        </button>
        {advanced && (
          <div id={advancedId} className={cn(panel, "mt-3")}>
            <p className="text-xs font-medium text-text-primary">Advanced options</p>
            <p className="text-[10px] leading-3 text-text-secondary">Set request limits and an optional expiration date.</p>
            <div className="mt-3">
              <LimitFields value={limits} onChange={setLimits} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t-[0.5px] border-line-tertiary pt-3">
              <CalendarDays className="size-3 text-text-secondary" aria-hidden="true" />
              <label htmlFor="api-key-expires" className="text-xs font-medium text-text-secondary">
                Expires
              </label>
              <input id="api-key-expires" type="date" min={today} value={expires} onChange={(event) => setExpires(event.target.value)} className={cn(field, "px-2 text-xs")} />
              <span className="text-xs font-medium text-text-secondary">Optional</span>
            </div>
          </div>
        )}
      </form>
      {created && <NewKey key={created.secret} secret={created.secret} label={created.label} onDone={() => setCreated(null)} />}
    </div>
  );
}

// ---- one key ----

type Editing = "rename" | "limits" | "revoke" | null;

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const { update, revoke } = useApiKeyActions();
  const [editing, setEditing] = useState<Editing>(null);
  const [label, setLabel] = useState(apiKey.label);
  const [limits, setLimits] = useState<LimitsText>({ perMinute: String(apiKey.perMinute), perDay: String(apiKey.perDay) });
  const [error, setError] = useState<string | null>(null);
  const busy = update.isPending || revoke.isPending;
  const expired = apiKey.status === "expired";

  function open(next: Editing) {
    setError(null);
    setLabel(apiKey.label);
    setLimits({ perMinute: String(apiKey.perMinute), perDay: String(apiKey.perDay) });
    setEditing(next);
  }
  const close = () => setEditing(null);

  function save(body: { label?: string; perMinute?: number; perDay?: number }) {
    // nothing changed: nothing to send
    if (Object.keys(body).length === 0) return close();
    update.mutate(
      { id: apiKey.id, body },
      { onSuccess: close, onError: (failure) => setError(keyError(failure)) },
    );
  }

  function rename() {
    const parsed = CreateApiKeyBodySchema.shape.label.safeParse(label);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Give the key a name.");
    save(parsed.data === apiKey.label ? {} : { label: parsed.data });
  }

  function saveLimits() {
    const read = readLimits(limits);
    if (typeof read === "string") return setError(read);
    save({
      ...(read.perMinute !== apiKey.perMinute && { perMinute: read.perMinute }),
      ...(read.perDay !== apiKey.perDay && { perDay: read.perDay }),
    });
  }

  return (
    <li className="rounded-[10px] border-[0.5px] border-line-secondary bg-surface-main p-4">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {editing === "rename" ? (
            <InlineEditor onSubmit={rename} onCancel={close} className="rounded-[4px] border-[0.5px] border-line-primary bg-surface-main-2 p-3">
              <label htmlFor={`rename-${apiKey.id}`} className="text-xs font-medium text-text-secondary">
                Rename key
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <input
                  id={`rename-${apiKey.id}`}
                  autoFocus
                  value={label}
                  maxLength={64}
                  onChange={(event) => setLabel(event.target.value)}
                  aria-invalid={!!error || undefined}
                  className={cn(field, "min-w-0 flex-1 px-2 text-sm sm:max-w-[154px]")}
                />
                <button type="submit" disabled={busy} className={cn(dark, "px-6")}>
                  Save
                </button>
                <button type="button" onClick={close} className={cn(quiet, "px-6")}>
                  Cancel
                </button>
              </div>
              {error && (
                <div className="mt-2">
                  <Alert>{error}</Alert>
                </div>
              )}
            </InlineEditor>
          ) : (
            <div className="flex min-h-7 items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium text-text-primary">{apiKey.label}</span>
              <button type="button" aria-label={`Rename ${apiKey.label}`} onClick={() => open("rename")} className={round}>
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-text-secondary">
            {/* only the start of a key is kept; the rest is never shown again */}
            <code className="font-mono font-normal">
              {apiKey.prefix}
              {MASK}
            </code>
            <span title="Created">{day(apiKey.createdAt)}</span>
            {expired ? (
              <span className="inline-flex h-5 items-center rounded-[4px] bg-destructive/10 px-2 text-destructive">Expired</span>
            ) : (
              apiKey.expiresAt && <span>Expires {day(apiKey.expiresAt)}</span>
            )}
            {apiKey.lastUsedAt && <span>Last used {day(apiKey.lastUsedAt)}</span>}
          </div>
        </div>
        {editing !== "revoke" && (
          <div className="shrink-0 pt-0.5">
            <button
              type="button"
              aria-label={`Revoke ${apiKey.label}`}
              onClick={() => open("revoke")}
              className="inline-flex h-8 items-center gap-[7px] rounded-full px-2.5 text-sm font-medium text-[#dc2626] outline-none hover:bg-[#dc2626]/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Revoke
            </button>
          </div>
        )}
      </div>

      {editing === "revoke" && (
        <div role="group" aria-label={`Revoke ${apiKey.label}?`} className="mt-3 rounded-[4px] border-[0.5px] border-[#dc2626]/40 bg-[#dc2626]/5 p-3">
          <p className="text-xs font-medium text-text-primary">Revoke “{apiKey.label}”?</p>
          <p className="text-[10px] leading-3 text-text-secondary">Anything using this key stops working at once. This can&apos;t be undone.</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" autoFocus onClick={close} disabled={busy} className={quiet}>
              Cancel
            </button>
            <button type="button" onClick={() => revoke.mutate(apiKey, { onSuccess: close })} disabled={busy} className={cn(pill, "bg-[#dc2626] text-white hover:bg-[#dc2626]/90")}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              {revoke.isPending ? "Revoking…" : "Revoke key"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 border-t-[0.5px] border-line-tertiary pt-3">
        {editing === "limits" ? (
          <InlineEditor onSubmit={saveLimits} onCancel={close} className="rounded-[4px] border-[0.5px] border-line-primary bg-surface-main-2 p-3">
            <p className="text-xs font-medium text-text-primary">Request limits</p>
            <p className="text-[10px] leading-3 text-text-secondary">Changes apply to this key only.</p>
            <div className="mt-3">
              <LimitFields value={limits} onChange={setLimits} invalid={!!error} />
            </div>
            {error && (
              <div className="mt-2">
                <Alert>{error}</Alert>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-1.5">
              <button type="button" onClick={close} className={quiet}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={dark}>
                Save
              </button>
            </div>
          </InlineEditor>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
              <Gauge className="size-3" aria-hidden="true" />
              <span className={chip}>{apiKey.perMinute}/min</span>
              <span className={chip}>{apiKey.perDay}/day</span>
            </div>
            <button type="button" aria-label={`Edit request limits for ${apiKey.label}`} onClick={() => open("limits")} className={cn(round, "ml-auto")}>
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ---- the dialog ----

function Body() {
  const { data, isPending, isError, refetch, isRefetching } = useApiKeys(true);

  return (
    <>
      <div className="pr-6">
        <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <KeyRound className="size-[18px]" aria-hidden="true" />
          API Keys
          {data && (
            <span aria-label={`${data.activeCount} of ${data.maxActive} active keys`} className="inline-flex h-5 items-center rounded-[4px] bg-surface-secondary px-2 text-xs font-medium text-text-secondary">
              {data.activeCount} / {data.maxActive}
            </span>
          )}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 max-w-[448px] text-sm text-text-secondary">
          Create scoped credentials for the REST API and MCP server. Keep keys private and revoke any credential you no longer trust.
        </DialogPrimitive.Description>
      </div>

      <CreateKey activeCount={data?.activeCount ?? 0} maxActive={data?.maxActive ?? 0} ready={!!data} />

      <div className="h-px shrink-0 bg-line-tertiary" />

      {isPending ? (
        <div aria-busy="true" aria-label="Loading your API keys" className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-[134px] animate-pulse rounded-[10px] bg-surface-secondary" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm font-medium text-text-primary">Couldn&apos;t load your API keys.</p>
          <button type="button" onClick={() => void refetch()} disabled={isRefetching} className={cn(quiet, "border border-line-secondary")}>
            Try again
          </button>
        </div>
      ) : data.apiKeys.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-[10px] border-[0.5px] border-dashed border-line-secondary py-8 text-center">
          <KeyRound className="mb-1 size-5 text-text-tertiary" aria-hidden="true" />
          <p className="text-sm font-medium text-text-primary">No API keys yet</p>
          <p className="text-xs text-text-secondary">Create one above to call the REST API or connect the MCP server.</p>
        </div>
      ) : (
        <ul aria-label="Your API keys" className="space-y-3">
          {data.apiKeys.map((apiKey) => (
            <KeyRow key={apiKey.id} apiKey={apiKey} />
          ))}
        </ul>
      )}

      {/* magica's API / MCP opens its documentation, which isn't part of this build */}
      <div className="flex flex-col gap-3 border-t border-line-tertiary pt-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">API documentation</p>
            <p className="text-xs text-text-secondary">Review REST API and MCP usage before creating production keys.</p>
          </div>
        </div>
        <div className="flex gap-2 max-sm:pl-7">
          {["API Reference", "MCP Server"].map((name) => (
            <button key={name} type="button" aria-disabled="true" title={INERT} className={cn(pill, "h-8 cursor-default border border-line-secondary px-3 text-text-secondary")}>
              {name}
              <ExternalLink className="size-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// magica's API Keys dialog, opened from the sidebar's "API / MCP": the "n / 10" counter, a key to create (shown
// once), and the keys there are, each to rename, re-limit or revoke.
export function ApiKeysDialog() {
  const open = useApiKeysDialog((s) => s.open);
  const setOpen = useApiKeysDialog((s) => s.setOpen);

  // opened from the sidebar rather than a trigger of its own: give focus back to what had it
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(10,10,11,0.5)] backdrop-blur-[3px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          // Escape inside a row's editor closes the editor, not the dialog
          onEscapeKeyDown={(event) => {
            if (event.target instanceof Element && event.target.closest("[data-inline-editor]")) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(84vh,calc(100dvh-32px))] w-[calc(100vw-32px)] max-w-[576px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-line-tertiary bg-surface-main p-6 text-text-primary shadow-[0_12px_16px_-4px_rgba(26,26,24,0.1),0_4px_6px_-2px_rgba(26,26,24,0.05)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-sm:p-4"
        >
          <Body />
          <DialogPrimitive.Close aria-label="Close" className="absolute right-4 top-4 rounded-md text-text-primary opacity-70 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
