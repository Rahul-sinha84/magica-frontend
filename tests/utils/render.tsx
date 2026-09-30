import type { ReactElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/queryClient";

// Renders with everything the app's providers give, minus retries and polling so failures show up fast.
export function renderApp(ui: ReactElement) {
  const client = makeQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false, refetchInterval: false } });

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
