import { clerkMiddleware } from "@clerk/nextjs/server";

// Only attaches auth state to the request; access checks live in the layouts.
export default clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
