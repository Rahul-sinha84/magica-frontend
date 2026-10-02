"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { MAX_ATTACHMENTS, type MediaAsset, type UploadFile } from "@/contracts";
import type { Api } from "@/lib/api";
import { ApiError } from "@/lib/queryClient";
import { UPLOAD_POLL_LIMIT_MS, UPLOAD_POLL_MS } from "@/lib/timing";
import { uploadToTransloadit, type RunningUpload } from "@/lib/transloadit";
import { checkFile, kindOf } from "@/lib/uploadFiles";
import { uuid } from "@/lib/uuid";
import { useAttachmentsStore, type Attachment } from "@/stores/attachmentsStore";
import { useApi } from "./useApi";

export const TOO_MANY = `A message can carry at most ${MAX_ATTACHMENTS} files.`;
const NOT_PROCESSED = "The file couldn't be processed.";
const STILL_PROCESSING = "This file is taking too long to process. Try again.";
// a signature this close to expiring is renewed before uploading
const SIGNATURE_MARGIN_MS = 60_000;

// What a file being uploaded needs beyond what the chip shows. Kept outside the store: a File and a running
// upload aren't state to render.
interface Job {
  key: string;
  file: File;
  upload: UploadFile;
  signed: { uploadId: string; params: string; signature: string; expiresAt: string } | null;
  assemblyId: string | null;
  running: RunningUpload | null;
  // removed by the user: whatever is still under way stops touching the chip
  dropped: boolean;
}

const jobs = new Map<string, Job>();

// a local picture for the chip while the file uploads; none where the browser can't make one
function localPreview(file: File) {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}
const store = () => useAttachmentsStore.getState();

function fail(job: Job, id: string, message: string) {
  if (!job.dropped) store().update(job.key, id, { status: "failed", error: message });
}

// The server's message, or for one file in a batch ("files.2.size: …"), the message meant for that file.
function messageFor(error: unknown, index: number) {
  if (!(error instanceof ApiError)) return "Couldn't start the upload. Try again.";
  const perFile = /^files\.(\d+)\.[^:]*: (.*)$/.exec(error.message);
  if (perFile) return Number(perFile[1]) === index ? perFile[2] : null;
  return error.message;
}

// Ask the server about an uploaded file until it is in the library (or can't be), every UPLOAD_POLL_MS for up
// to UPLOAD_POLL_LIMIT_MS. The server checks with the upload service itself, so asking again is always safe.
async function confirm(api: Api, id: string) {
  const job = jobs.get(id);
  if (!job?.signed || !job.assemblyId) return;
  store().update(job.key, id, { status: "processing", progress: 1, error: null });
  const started = Date.now();
  for (;;) {
    let result;
    try {
      result = (await api.uploads.complete(job.signed.uploadId, job.assemblyId)).upload;
    } catch (error) {
      return fail(job, id, error instanceof ApiError ? error.message : NOT_PROCESSED);
    }
    if (job.dropped) return;
    if (result.status === "completed" && result.asset) {
      store().update(job.key, id, { status: "ready", asset: result.asset, error: null });
      return;
    }
    if (result.status === "failed") return fail(job, id, result.errorMessage ?? NOT_PROCESSED);
    if (Date.now() - started >= UPLOAD_POLL_LIMIT_MS) return fail(job, id, STILL_PROCESSING);
    await new Promise((resolve) => setTimeout(resolve, UPLOAD_POLL_MS));
    if (job.dropped) return;
  }
}

function send(api: Api, id: string) {
  const job = jobs.get(id);
  if (!job?.signed || job.dropped) return;
  store().update(job.key, id, { status: "uploading", progress: 0, error: null });
  job.running = uploadToTransloadit(job.file, job.upload.mimeType, job.signed, {
    onProgress: (fraction) => !job.dropped && store().update(job.key, id, { progress: fraction }),
    onUploaded: (assemblyId) => {
      job.assemblyId = assemblyId;
      job.running = null;
      void confirm(api, id);
    },
    onError: (message) => {
      job.running = null;
      fail(job, id, message);
    },
  });
}

// Signs these uploads in one request (in order), then starts each.
async function signAndSend(api: Api, ids: string[]) {
  const batch = ids.map((id) => jobs.get(id)).filter((job): job is Job => !!job);
  if (batch.length === 0) return;
  try {
    const { uploads } = await api.uploads.create(batch.map((job) => job.upload));
    batch.forEach((job, index) => {
      job.signed = uploads[index] ?? null;
      job.assemblyId = null;
      if (job.signed) send(api, ids[index]);
      else fail(job, ids[index], "Couldn't start the upload. Try again.");
    });
  } catch (error) {
    batch.forEach((job, index) => {
      const message = messageFor(error, index);
      // a per-file refusal for another file in the batch: this one was fine, so try it again on its own
      if (message === null) void signAndSend(api, [ids[index]]);
      else fail(job, ids[index], message);
    });
  }
}

// The files a composer holds, and what can be done with them. Uploads carry on whatever is on screen; the chips
// show where each stands.
export function useAttachments(key: string) {
  const api = useApi();
  const items = useAttachmentsStore((s) => s.byComposer[key]) ?? NONE;

  return useMemo(() => {
    const room = () => MAX_ATTACHMENTS - (store().byComposer[key]?.length ?? 0);

    function addFiles(files: File[]) {
      if (files.length === 0) return;
      const fits = files.slice(0, Math.max(0, room()));
      if (fits.length < files.length) toast.error("Some files weren't attached", { description: TOO_MANY });

      const added: Attachment[] = [];
      for (const file of fits) {
        const check = checkFile(file);
        if (!check.ok) {
          toast.error(`Couldn't attach ${file.name}`, { description: check.reason });
          continue;
        }
        const id = uuid();
        const kind = kindOf(check.upload.mimeType);
        jobs.set(id, { key, file, upload: check.upload, signed: null, assemblyId: null, running: null, dropped: false });
        added.push({
          id,
          name: check.upload.name,
          kind,
          status: "uploading",
          progress: 0,
          previewUrl: kind === "image" ? localPreview(file) : null,
          asset: null,
          error: null,
        });
      }
      if (added.length === 0) return;
      store().add(key, added);
      void signAndSend(
        api,
        added.map((item) => item.id),
      );
    }

    // a file from the media library: ready at once
    function addAsset(asset: MediaAsset) {
      const current = store().byComposer[key] ?? [];
      if (current.some((item) => item.asset?.id === asset.id)) return; // each file goes once
      if (room() <= 0) {
        toast.error("Couldn't attach the file", { description: TOO_MANY });
        return;
      }
      store().add(key, [
        {
          id: uuid(),
          name: asset.name ?? asset.prompt ?? asset.model ?? "Generated media",
          kind: asset.type,
          status: "ready",
          progress: 1,
          previewUrl: asset.type === "image" ? asset.url : null,
          asset,
          error: null,
        },
      ]);
    }

    function remove(id: string) {
      const job = jobs.get(id);
      if (job) {
        job.dropped = true;
        job.running?.cancel();
        jobs.delete(id);
      }
      const item = store().byComposer[key]?.find((entry) => entry.id === id);
      if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      store().remove(key, id);
    }

    function retry(id: string) {
      const job = jobs.get(id);
      if (!job) return;
      job.dropped = false;
      // uploaded already: only the server's check is left (it is safe to repeat)
      if (job.signed && job.assemblyId) return void confirm(api, id);
      store().update(key, id, { status: "uploading", progress: 0, error: null });
      const fresh = job.signed && Date.parse(job.signed.expiresAt) - Date.now() > SIGNATURE_MARGIN_MS;
      if (fresh) send(api, id);
      else void signAndSend(api, [id]);
    }

    // after a send: the chips go (their files are with the message)
    function clear() {
      for (const item of store().byComposer[key] ?? []) {
        jobs.delete(item.id);
        if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
      store().set(key, []);
    }

    // put the chips back (a send that didn't go), keeping their files
    function restore(previous: Attachment[]) {
      store().set(key, [...previous, ...(store().byComposer[key] ?? [])]);
    }

    function markRefused(index: number, message: string) {
      const item = store().byComposer[key]?.[index];
      if (!item) return;
      store().update(key, item.id, /expired/i.test(message) ? { status: "expired", error: message } : { status: "failed", error: message });
    }

    return { items, addFiles, addAsset, remove, retry, clear, restore, markRefused };
  }, [api, key, items]);
}

const NONE: Attachment[] = [];

// Every chip is ready to go (nothing uploading, failed or expired).
export const allReady = (items: Attachment[]) => items.every((item) => item.status === "ready" && item.asset);
