import type { NextConfig } from "next";

// Mock mode is for development. A production build ignores the flag, so a leftover line in
// .env.local can't ship fake data; set ALLOW_MOCKS_IN_BUILD=true to keep it on purpose (for
// example a demo with no backend). The value is always written out ("true" or "false") so the
// mock backend is dropped from the bundle when it is off (see AppProviders).
const wantsMocks = process.env.NEXT_PUBLIC_API_MOCKING === "true";
const allowMocks = process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCKS_IN_BUILD === "true";

if (wantsMocks && !allowMocks) {
  console.warn("NEXT_PUBLIC_API_MOCKING=true is ignored in a production build (set ALLOW_MOCKS_IN_BUILD=true to keep it).");
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_API_MOCKING: wantsMocks && allowMocks ? "true" : "false" },
};

export default nextConfig;
