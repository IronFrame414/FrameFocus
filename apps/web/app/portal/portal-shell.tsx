import Link from 'next/link';
import type { ReactNode } from 'react';
import { color, font } from '@/lib/theme';
import type { PortalBranding } from '@/lib/services/portal';

/**
 * R20 — the branding swap, rendered.
 *
 * ===========================================================================
 * ⚠️ THE COMPANY'S IDENTITY REPLACES THE PRODUCT'S. NOT BESIDE IT.
 * ===========================================================================
 * `9-spec.md` §11, Josh's reasoning: *"company users see the software name and
 * may promote it; clients virtually never will, so this lets companies appear
 * to own the tool."*
 *
 * So there is **no `brand.name` anywhere in this file** and there must not be.
 * `lib/brand.ts` says the same thing from the other end: *"Client-facing
 * proposals, invoices and change orders are deliberately white-label … Do not
 * 'helpfully' add a product footer to them."* The portal is the same surface,
 * continuously rather than one document at a time.
 *
 * ===========================================================================
 * AND THE SWAP IS POST-AUTH BY CONSTRUCTION, NOT BY DISCIPLINE
 * ===========================================================================
 * §11: *"no tenant identity exposed pre-auth."* This component takes branding
 * as a prop; the only caller is `layout.tsx`, which cannot produce it without a
 * session, because `getPortalBranding()` reads `companies` through the caller's
 * own client. There is no code path that renders a company name to an
 * unauthenticated visitor — not because a check forbids it, but because the
 * value does not exist until a session does.
 *
 * The sign-in page is untouched. It is the same page, with the same platform
 * branding, for every user type.
 */

export interface PortalNavItem {
  href: string;
  label: string;
}

export function PortalShell({
  branding,
  nav,
  navSlot,
  backHref,
  heading,
  subheading,
  children,
}: {
  branding: PortalBranding;
  nav: PortalNavItem[];
  /**
   * [S168] A rendered nav, for the pages that need an ACTIVE state and
   * therefore a client component. `nav` above stays as it is — a plain list
   * this server component can render itself — so the front door is unchanged
   * and nothing was migrated for the sake of consistency.
   *
   * The shell takes it as a slot rather than importing it, so this file keeps
   * no dependency on any particular route tree and stays a server component.
   */
  navSlot?: ReactNode;
  backHref?: string;
  heading: string;
  subheading?: string;
  children: ReactNode;
}) {
  // The company's own colour where it has one, the app's primary otherwise.
  // A tenant with no `brand_color` must look deliberate, not unfinished.
  const accent = branding.brandColor || color.primary;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: color.pageBg, fontFamily: font.sans }}>
      <header
        style={{
          backgroundColor: color.cardBg,
          borderBottom: `1px solid ${color.cardBorder}`,
          padding: '14px 20px',
        }}
      >
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.companyName}
              style={{ height: '30px', width: 'auto', maxWidth: '160px', objectFit: 'contain' }}
            />
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: accent,
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '14px',
              }}
            >
              {(branding.companyName || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <span style={{ fontSize: '15px', fontWeight: 700, color: color.navy }}>
            {branding.companyName}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '22px 20px 60px' }}>
        {backHref && (
          <Link
            href={backHref}
            style={{ fontSize: '13px', color: accent, textDecoration: 'none', fontWeight: 600 }}
          >
            ← All projects
          </Link>
        )}

        <h1
          style={{
            fontSize: '25px',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            color: color.navy,
            margin: backHref ? '10px 0 0' : '0',
          }}
        >
          {heading}
        </h1>
        {subheading && (
          <p style={{ fontSize: '13.5px', color: color.muted, margin: '5px 0 0' }}>{subheading}</p>
        )}

        {navSlot}

        {nav.length > 0 && (
          <nav
            style={{
              display: 'flex',
              gap: '6px',
              margin: '18px 0 16px',
              flexWrap: 'wrap',
              borderBottom: `1px solid ${color.cardBorder}`,
              paddingBottom: '10px',
            }}
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: color.bodyAlt,
                  textDecoration: 'none',
                  padding: '6px 11px',
                  borderRadius: '8px',
                  backgroundColor: color.pageBg,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {children}
      </main>
    </div>
  );
}
