import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/layout/AppShell";

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  await auth.protect();
  return <AppShell>{children}</AppShell>;
}
