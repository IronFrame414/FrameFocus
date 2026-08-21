import type {
  EstimateStatus,
  MaterialUnitOfMeasure,
  PricingMode,
} from '@/lib/services/estimates-client';

export const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  revised: 'Revised',
  converted: 'Converted',
};

// badge colors: [background, text]
export const STATUS_COLORS: Record<EstimateStatus, [string, string]> = {
  draft: ['#f3f4f6', '#374151'],
  review: ['#fef3c7', '#92400e'],
  sent: ['#dbeafe', '#1e40af'],
  viewed: ['#e0e7ff', '#3730a3'],
  accepted: ['#dcfce7', '#166534'],
  declined: ['#fee2e2', '#991b1b'],
  expired: ['#f3f4f6', '#6b7280'],
  revised: ['#fae8ff', '#86198f'],
  converted: ['#ccfbf1', '#115e59'],
};

export const UNIT_LABELS: Record<MaterialUnitOfMeasure, string> = {
  each: 'Each',
  sq_ft: 'Sq Ft',
  linear_ft: 'Linear Ft',
  box: 'Box',
  bundle: 'Bundle',
  bag: 'Bag',
  gallon: 'Gallon',
  pair: 'Pair',
  set: 'Set',
  other: 'Other',
};

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  markup: 'Markup',
  margin: 'Margin',
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function fmtMoney(value: number | null | undefined): string {
  return moneyFormatter.format(value ?? 0);
}

export function fmtPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value}%`;
}
