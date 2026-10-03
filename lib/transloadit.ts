import Uppy from "@uppy/core";
import Transloadit from "@uppy/transloadit";

export interface SignedUpload {
  // the exact JSON string the server signed, passed on unchanged
  params: string;
  signature: string;
}

export interface UploadHandlers {
  onProgress: (fraction: number) => void;
  // the file reached the upload service, in this assembly
  onUploaded: (assemblyId: string) => void;
  onError: (message: string) => void;
}

export interface RunningUpload {
  cancel: () => void;
}

const LOST = "The upload didn't finish. Check your connection and try again.";

// One file, in its own Transloadit assembly (the server signs one per file), sent over tus: resumable, and retried
// on its own after a dropped connection. The assembly's processing is the server's to follow (it checks with
// Transloadit when told the upload is done), so this is finished once the bytes are there.
export function uploadToTransloadit(file: File, mimeType: string, signed: SignedUpload, handlers: UploadHandlers): RunningUpload {
  const uppy = new Uppy({ autoProceed: false });
  uppy.use(Transloadit, { assemblyOptions: { params: signed.params, signature: signed.signature }, waitForEncoding: false });

  let assemblyId: string | null = null;
  let settled = false;
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    handlers.onError(message);
  };

  uppy.on("transloadit:assembly-created", (assembly) => {
    assemblyId = assembly.assembly_id ?? null;
  });
  uppy.on("upload-progress", (_file, progress) => {
    if (progress.bytesTotal) handlers.onProgress(Math.min(1, (progress.bytesUploaded ?? 0) / progress.bytesTotal));
  });
  uppy.on("upload-error", () => fail(LOST));
  uppy.on("complete", (result) => {
    if (settled) return;
    if ((result.failed?.length ?? 0) > 0 || !assemblyId) return fail(LOST);
    settled = true;
    handlers.onUploaded(assemblyId);
  });

  uppy.addFile({ name: file.name, type: mimeType, data: file });
  uppy.upload().catch(() => fail(LOST));

  return {
    cancel: () => {
      settled = true;
      uppy.cancelAll();
      uppy.destroy();
    },
  };
}
