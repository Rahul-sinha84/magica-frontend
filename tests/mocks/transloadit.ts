import type { RunningUpload, SignedUpload, UploadHandlers } from "@/lib/transloadit";

// A stand-in for the Transloadit upload (Uppy and tus), which can't run here. Each upload is recorded; by default
// it finishes at once, or a test holds it and moves it along itself.
interface FakeUpload {
  file: File;
  mimeType: string;
  signed: SignedUpload;
  handlers: UploadHandlers;
  cancelled: boolean;
}

// what Transloadit names an assembly: 32 hex characters
export const assemblyIdFor = (n: number) => String(n).padStart(32, "a");

export const transloadit = {
  uploads: [] as FakeUpload[],
  // uploads wait for the test to finish them
  hold: false,
  progress(index: number, fraction: number) {
    transloadit.uploads[index].handlers.onProgress(fraction);
  },
  finish(index: number) {
    transloadit.uploads[index].handlers.onUploaded(assemblyIdFor(index + 1));
  },
  fail(index: number, message = "The upload didn't finish. Check your connection and try again.") {
    transloadit.uploads[index].handlers.onError(message);
  },
  reset() {
    transloadit.uploads = [];
    transloadit.hold = false;
  },
};

export const transloaditModule = {
  uploadToTransloadit(file: File, mimeType: string, signed: SignedUpload, handlers: UploadHandlers): RunningUpload {
    const upload: FakeUpload = { file, mimeType, signed, handlers, cancelled: false };
    transloadit.uploads.push(upload);
    const n = transloadit.uploads.length;
    if (!transloadit.hold) {
      setTimeout(() => {
        if (upload.cancelled) return;
        handlers.onProgress(1);
        handlers.onUploaded(assemblyIdFor(n));
      }, 0);
    }
    return {
      cancel: () => {
        upload.cancelled = true;
      },
    };
  },
};
