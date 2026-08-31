import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { MarkdownDoc } from '@/components/public/markdown-doc';
import { readLegalDoc } from '@/lib/legal-docs';

export const metadata: Metadata = {
  title: `Privacy Policy — ${brand.name}`,
};

// The reviewed Privacy Policy, rendered VERBATIM from docs/specs/privacy-policy.md
// (read at build time — see lib/legal-docs.ts). Public and static: loads with no
// session. ⚠️ The policy states there is no analytics or tracking — keep that true
// (add no pixels/scripts). Do not paraphrase or reformat; to change the document,
// edit the .md.
export default function PrivacyPage() {
  const markdown = readLegalDoc('privacy-policy');
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
