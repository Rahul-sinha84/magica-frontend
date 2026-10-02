"use client";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

// The server only checks the session on a full page load. After that navigation stays in the
// browser, so this sends you to sign-in if the session ends (expiry, or signing out in another tab).
export function SessionGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && !isSignedIn ? <RedirectToSignIn /> : null;
}
