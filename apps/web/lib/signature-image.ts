/**
 * A typed name, rendered to the same PNG every signing surface stores.
 *
 * ⚠️ EXTRACTED [S164], AND IT WAS ALREADY DUPLICATED BEFORE M9 ADDED A THIRD
 * CALLER. `app/sign/[token]/signing-client.tsx:51` and
 * `app/sign-co/[token]/co-signing-client.tsx:61` each carried their own copy —
 * identical today, and free to drift, in the function that produces the IMAGE
 * OF A SIGNATURE that ends up composited into a signed PDF.
 *
 * That is the `#129` shape precisely: two implementations that both "work",
 * differing in what they store. A change to the font here — or to the canvas
 * size, which is what the PDF scales from — applied to one copy and not the
 * other would produce two signatures of visibly different weight on documents
 * from the same company, and nothing would fail.
 *
 * The portal is the third caller. It extracts rather than copying, because
 * adding the third copy is the point at which "they happen to agree" stops
 * being survivable.
 *
 * Browser-only: it needs a `<canvas>`. Callers are all `'use client'`.
 */
export function typedSignatureToDataUrl(name: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#111827';
    ctx.font = '56px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 24, 80);
  }
  return canvas.toDataURL('image/png');
}
