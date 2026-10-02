import type { AnchorHTMLAttributes, ReactNode } from "react";
import { vi } from "vitest";

// Stand-in for next/navigation and next/link, which need a mounted Next.js router.
export const navigation = {
  pathname: "/chat",
  params: {} as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
};

export function resetNavigation() {
  navigation.pathname = "/chat";
  navigation.params = {};
  navigation.push.mockReset();
  navigation.replace.mockReset();
}

export const navigationModule = {
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => navigation.pathname,
  useParams: () => navigation.params,
};

export const linkModule = {
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
};
