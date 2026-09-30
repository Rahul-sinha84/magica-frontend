import type { ReactNode } from "react";
import { vi } from "vitest";

// Stand-in for @clerk/nextjs: tests flip `clerkState` to play a signed-in or signed-out visitor.
export const clerkState = { isLoaded: true, isSignedIn: true, signOut: vi.fn() };

export function resetClerk() {
  Object.assign(clerkState, { isLoaded: true, isSignedIn: true });
  clerkState.signOut.mockReset();
}

export const clerkModule = {
  useAuth: () => ({
    isLoaded: clerkState.isLoaded,
    isSignedIn: clerkState.isSignedIn,
    getToken: async () => "test-token",
  }),
  useClerk: () => ({ signOut: clerkState.signOut }),
  UserButton: ({ showName }: { showName?: boolean }) => (
    <button type="button" aria-label="Open user menu">
      {showName ? "Test User" : "TU"}
    </button>
  ),
  RedirectToSignIn: () => <div data-testid="redirect-to-sign-in" />,
  ClerkLoading: ({ children }: { children: ReactNode }) => <>{children}</>,
  ClerkFailed: () => null,
};
