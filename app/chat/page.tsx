import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

// Placeholder shell for phase 1; replaced by the real chat layout in phase 3.
export default async function ChatPage() {
  const user = await currentUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">Your AI worker</h1>
      <p className="text-text-secondary">Signed in as {user?.firstName ?? "you"}</p>
      <UserButton />
      <ThemeToggle />
    </main>
  );
}
