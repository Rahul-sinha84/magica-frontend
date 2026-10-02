"use client";

import { useMemo } from "react";
import { previewBlock } from "@/lib/uploadFiles";
import { useChatStore } from "@/stores/chatStore";
import { useAttachments } from "./useAttachments";

// A composer's files, as the Composer takes them. A ready picture opens in the preview, as on magica; on the home
// screen, which has no task yet, the preview belongs to no task (chatId "").
export function useComposerAttachments(key: string, chatId: string | null) {
  const attachments = useAttachments(key);
  const openPreview = useChatStore((s) => s.openArtifactPanel);
  return useMemo(
    () => ({
      items: attachments.items,
      onPickFiles: attachments.addFiles,
      onPickAsset: attachments.addAsset,
      onRemove: attachments.remove,
      onRetry: attachments.retry,
      onOpen: (item: (typeof attachments.items)[number]) => {
        const block = item.asset && previewBlock(item.asset);
        if (block && item.asset) {
          const { createdAt, source, name } = item.asset;
          openPreview({ chatId: chatId ?? "", asset: block, createdAt, openedBy: "user", source, name });
        }
      },
    }),
    [attachments, chatId, openPreview],
  );
}
