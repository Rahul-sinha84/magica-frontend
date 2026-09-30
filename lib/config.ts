// `||` (not `??`) so an empty value in .env falls back too; a trailing slash would double up in paths.
export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");
