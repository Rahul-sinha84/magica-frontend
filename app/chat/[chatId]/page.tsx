import { auth } from "@clerk/nextjs/server";
import { ChatWindow } from "@/components/chat/ChatWindow";

export default async function ChatPage({ params }: PageProps<"/chat/[chatId]">) {
  await auth.protect();
  const { chatId } = await params;
  return <ChatWindow chatId={chatId} />;
}
