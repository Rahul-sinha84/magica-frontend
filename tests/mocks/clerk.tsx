import type { ReactNode } from "react";
import { vi } from "vitest";

// Stand-in for @clerk/nextjs: tests flip `clerkState` to play a signed-in or signed-out visitor.
export const clerkState = {
  isLoaded: true,
  isSignedIn: true,
  signOut: vi.fn(),
  userButtonProps: undefined as undefined | { appearance?: { elements?: Record<string, string> } },
};

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
  UserButton: (props: { showName?: boolean; appearance?: { elements?: Record<string, string> } }) => {
    clerkState.userButtonProps = props;
    return (
      <button type="button" aria-label="Open user menu">
        {props.showName ? "Test User" : "TU"}
      </button>
    );
  },
  RedirectToSignIn: () => <div data-testid="redirect-to-sign-in" />,
  ClerkLoading: ({ children }: { children: ReactNode }) => <>{children}</>,
  ClerkFailed: () => null,
};
