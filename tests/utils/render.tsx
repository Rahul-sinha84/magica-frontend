import type { ReactElement } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/queryClient";

// Renders with everything the app's providers give, minus retries and polling so failures show up fast.
export function renderApp(ui: ReactElement, { prepare }: { prepare?: (client: QueryClient) => void } = {}) {
  const client = makeQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false, refetchInterval: false } });

  prepare?.(client);

  const wrap = (children: ReactElement) => (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
  const result = render(wrap(ui));

  return {
    ...result,
    client,
    user: userEvent.setup(),
    rerender: (next: ReactElement) => result.rerender(wrap(next)),
  };
}

// Types text, waits until the box really holds it, then presses Enter. Pressing Enter while React
// is still catching up with the last keystroke would add a new line instead of sending.
export async function typeAndSend(user: ReturnType<typeof userEvent.setup>, box: HTMLElement, text: string) {
  await user.type(box, text);
  await waitFor(() => expect(box).toHaveValue(text));
  await user.keyboard("{Enter}");
}
