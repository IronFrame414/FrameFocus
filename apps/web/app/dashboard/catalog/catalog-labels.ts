import type {
  CatalogCategory,
  CatalogUnitOfMeasure,
} from '@/lib/services/cost-catalog-client';

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  lumber: 'Lumber',
  fasteners: 'Fasteners',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  finishes: 'Finishes',
  concrete: 'Concrete',
  drywall: 'Drywall',
  roofing: 'Roofing',
  paint: 'Paint',
  hardware: 'Hardware',
  insulation: 'Insulation',
  other: 'Other',
};

export const UNIT_LABELS: Record<CatalogUnitOfMeasure, string> = {
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
