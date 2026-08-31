import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// Renders a markdown string as React elements (no dangerouslySetInnerHTML).
// remark-gfm supplies GFM tables — the privacy policy's service-provider list
// and retention-window tables depend on it. Styling is explicit per element
// because the repo has no @tailwindcss/typography plugin. `node` is destructured
// out of every override so react-markdown's AST node is not spread onto the DOM.
//
// ⚠️ This component RENDERS the reviewed text; it does not edit it. The markdown
// string it receives is the verbatim file (see lib/legal-docs.ts).

const components: Components = {
  h1: ({ node, ...props }) => (
    <h1 className="mt-10 text-3xl font-bold tracking-tight text-brand-900 first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="mt-10 text-2xl font-bold text-brand-900" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mt-8 text-xl font-semibold text-brand-900" {...props} />
  ),
  h4: ({ node, ...props }) => (
    <h4 className="mt-6 text-lg font-semibold text-brand-900" {...props} />
  ),
  p: ({ node, ...props }) => <p className="mt-4 leading-relaxed text-gray-700" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="mt-4 list-disc space-y-1.5 pl-6 text-gray-700" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="mt-4 list-decimal space-y-1.5 pl-6 text-gray-700" {...props} />
  ),
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  a: ({ node, ...props }) => (
    <a className="font-medium text-brand-500 underline hover:text-brand-600" {...props} />
  ),
  strong: ({ node, ...props }) => <strong className="font-semibold text-brand-900" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-4 border-l-4 border-gray-200 pl-4 italic text-gray-600"
      {...props}
    />
  ),
  hr: () => <hr className="my-8 border-gray-200" />,
  // Wide tables scroll inside their own container so the page body never scrolls
  // horizontally.
  table: ({ node, ...props }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="border-b-2 border-gray-300" {...props} />,
  th: ({ node, ...props }) => (
    <th className="px-3 py-2 text-left font-semibold text-brand-900" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-gray-200 px-3 py-2 align-top text-gray-700" {...props} />
  ),
  code: ({ node, ...props }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 text-sm text-brand-900" {...props} />
  ),
};

export function MarkdownDoc({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
