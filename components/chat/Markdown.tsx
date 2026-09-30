"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Text from the model is untrusted. react-markdown does not render raw HTML and strips javascript:
// links. Images are shown as links so a reply can't make the browser fetch pictures on its own.
const components: Components = {
  p: ({ children }) => <p className="mb-4 break-words text-base leading-7 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      <a href={src} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {alt || "Image"}
      </a>
    ) : null,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6 text-base leading-7 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6 text-base leading-7 last:mb-0">{children}</ol>,
  h1: ({ children }) => <h3 className="mb-3 mt-6 text-xl font-bold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-3 mt-6 text-lg font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-bold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 border-l-2 border-line-secondary pl-4 text-text-secondary last:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-line-secondary" />,
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-xl bg-surface-primary p-4 text-sm leading-6 last:mb-0 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code className={cn("rounded bg-surface-secondary px-1 py-0.5 font-mono text-[0.9em]", className)}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-line-secondary bg-surface-primary px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-line-secondary px-3 py-2">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
