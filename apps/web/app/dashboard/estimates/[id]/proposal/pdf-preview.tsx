'use client';

import { PDFViewer } from '@react-pdf/renderer';
import type { ProposalData } from '@/lib/proposal/proposal-data';
import { ProposalDocument } from '@/lib/proposal/proposal-template';

// Loaded via next/dynamic with ssr: false — @react-pdf/renderer's
// viewer needs the DOM.

export default function PdfPreview({ data }: { data: ProposalData }) {
  return (
    <PDFViewer
      style={{ width: '100%', height: '72vh', border: '1px solid #e5e7eb', borderRadius: 8 }}
    >
      <ProposalDocument data={data} />
    </PDFViewer>
  );
}
