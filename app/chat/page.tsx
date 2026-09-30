import { auth } from "@clerk/nextjs/server";
import { HomeScreen } from "@/components/chat/HomeScreen";

export default async function ChatHomePage() {
  await auth.protect();
  return <HomeScreen />;
}
