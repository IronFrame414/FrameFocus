// ── Trade Types ──
// Used for company trade selection, subcontractor trades, and vendor categorization

export const TRADE_TYPES = [
  'General Contractor',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Roofing',
  'Painting',
  'Concrete / Masonry',
  'Framing / Carpentry',
  'Flooring',
  'Landscaping',
  'Glazing / Aluminum',
  'Fire Protection',
  'Insulation',
  'Drywall',
  'Demolition',
  'Excavation / Site Work',
  'Steel / Structural',
  'Waterproofing',
  'Other',
] as const;

export type TradeType = (typeof TRADE_TYPES)[number];

// ── US States ──
// Two-letter postal abbreviations including DC

export const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
] as const;

export type USState = (typeof US_STATES)[number];

// ── Lead Sources ──
// Where a lead came from (Module 2 contacts)

export const LEAD_SOURCES = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'google', label: 'Google' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'repeat', label: 'Repeat Customer' },
  { value: 'other', label: 'Other' },
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number]['value'];
