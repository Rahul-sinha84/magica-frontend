import { auth } from "@clerk/nextjs/server";

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  await auth.protect();
  return children;
}
