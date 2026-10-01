"use client";

import Image from "next/image";
import { format } from "date-fns";
import { Composer } from "@/components/composer/Composer";
import { useClock } from "@/hooks/useClock";
import { useSendMessage } from "@/hooks/useSendMessage";
import { NEW_CHAT, useChatStore } from "@/stores/chatStore";
import { ChatHeader } from "./ChatHeader";

export function HomeScreen() {
  const text = useChatStore((state) => state.drafts[NEW_CHAT] ?? "");
  const setDraft = useChatStore((state) => state.setDraft);
  const { send, isSending } = useSendMessage(null);
  const now = useClock();

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatHeader />
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
        <div className="flex w-full max-w-[1000px] flex-col items-center gap-12 px-2 pb-8 sm:px-4 md:px-6 lg:px-0">
          <div className="w-[min(448px,calc(100vw-48px))] pt-12 text-center md:pt-[113px]">
            <Image src="/brand/magica-hero.svg" alt="" width={40} height={40} priority className="mx-auto" />
            {/* the viewer's local time, so nothing is rendered until the browser knows it */}
            <p className="mt-[14px] flex h-5 items-start justify-center gap-0.5 text-[13px] font-medium text-text-secondary md:mt-[19px]">
              {now && (
                <>
                  <span>{format(now, "h:mm")}</span>
                  <sup className="text-[10px] leading-none">{format(now, "a")}</sup>
                </>
              )}
            </p>
            <h1 className="mt-4 text-xl font-bold text-text-primary md:mt-1 md:text-2xl">Your AI worker</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-text-secondary">Work at the speed of thought.</p>
          </div>
          <Composer
            value={text}
            onChange={(value) => setDraft(NEW_CHAT, value)}
            placeholder="Assign a task or ask anything…"
            onSubmit={() => send(text)}
            sending={isSending}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
