import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { MarkdownDoc } from '@/components/public/markdown-doc';
import { readLegalDoc } from '@/lib/legal-docs';

export const metadata: Metadata = {
  title: `Terms of Service — ${brand.name}`,
};

// The reviewed Terms of Service, rendered VERBATIM from docs/specs/terms-of-service.md
// (read at build time — see lib/legal-docs.ts). Public and static: loads with no
// session. Do not paraphrase, shorten, or reformat the wording — to change the
// document, edit the .md.
export default function TermsPage() {
  const markdown = readLegalDoc('terms-of-service');
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <MarkdownDoc markdown={markdown} />
      </main>
      <SiteFooter />
    </div>
  );
}
