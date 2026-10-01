"use client";

import { Children, isValidElement, useMemo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

// The text of a fenced block, whatever react-markdown wrapped it in.
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}

const paragraph = "mb-4 break-words text-base leading-7 last:mb-0";
const link = "text-[#0b62f1] hover:underline dark:text-[#5b9bff]";

function ImageLink({ src, alt }: { src?: unknown; alt?: string }) {
  return typeof src === "string" ? (
    <a href={src} target="_blank" rel="noopener noreferrer" className={link}>
      {alt || "Image"}
    </a>
  ) : null;
}

// Text from the model is untrusted. react-markdown does not render raw HTML and strips javascript:
// links. Images are shown as links so a reply can't make the browser fetch pictures on its own (the one
// exception is below). Sizes, spacing and colours follow magica.com's chat.
const components: Components = {
  p: ({ children }) => <p className={paragraph}>{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
    </a>
  ),
  img: ({ src, alt }) => <ImageLink src={src} alt={alt} />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="ml-4 list-disc text-base leading-7 [&>li]:py-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="ml-8 list-decimal text-base leading-7 tabular-nums [&>li]:py-0.5">{children}</ol>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-2xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-xl font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold leading-7">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-line-secondary py-1 pl-6">{children}</blockquote>,
  hr: () => <hr className="my-6 border-line-secondary" />,
  pre: ({ children }) => {
    // a fenced block: react-markdown hands over <code class="language-x">
    const code = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
    const language = code?.props.className?.match(/language-([\w+#-]+)/)?.[1] ?? null;
    return <CodeBlock language={language} code={textOf(code?.props.children ?? children).replace(/\n$/, "")} />;
  },
  code: ({ children }) => <code className="rounded-[4px] bg-surface-secondary px-1 py-0.5 font-mono text-sm leading-5">{children}</code>,
  table: ({ children }) => (
    <div className="my-1 overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
  tr: ({ children }) => <tr className="border-b border-line-secondary">{children}</tr>,
  th: ({ children }) => <th className="px-4 py-2 text-left text-sm font-semibold leading-5">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 text-sm leading-5">{children}</td>,
};

// The picture to show for an image's address, or null to leave it a link.
export type PictureFor = (src: string) => ReactNode | null;

type Node = ExtraProps["node"];
const hasPicture = (node: Node, pictureFor: PictureFor) =>
  !!node?.children.some((child) => child.type === "element" && child.tagName === "img" && typeof child.properties.src === "string" && pictureFor(child.properties.src));

// `pictureFor`: as on magica, a picture this reply made that the model also put in its text shows there, in
// place, like any other picture in the chat. A paragraph holding one becomes a div, since a picture can't sit
// inside a <p>.
export function Markdown({ children, pictureFor }: { children: string; pictureFor?: PictureFor }) {
  const parts = useMemo<Components>(() => {
    if (!pictureFor) return components;
    return {
      ...components,
      p: ({ node, children }) => (hasPicture(node, pictureFor) ? <div className={paragraph}>{children}</div> : <p className={paragraph}>{children}</p>),
      img: ({ src, alt }) => (typeof src === "string" && pictureFor(src)) || <ImageLink src={src} alt={alt} />,
    };
  }, [pictureFor]);
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={parts}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
