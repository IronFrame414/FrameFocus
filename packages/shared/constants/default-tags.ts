// Default tag list seeded for every new company.
// Companies can edit (add/deactivate/rename) after seeding.
// See Module 3H in CLAUDE.md.

export type TagCategory = 'trade' | 'stage' | 'area' | 'condition' | 'documentation';

export interface DefaultTag {
  name: string;
  category: TagCategory;
  sort_order: number;
}

export const DEFAULT_TAGS: DefaultTag[] = [
  // Trade / Work Type
  { name: 'framing', category: 'trade', sort_order: 100 },
  { name: 'foundation', category: 'trade', sort_order: 110 },
  { name: 'concrete', category: 'trade', sort_order: 120 },
  { name: 'masonry', category: 'trade', sort_order: 130 },
  { name: 'roofing', category: 'trade', sort_order: 140 },
  { name: 'siding', category: 'trade', sort_order: 150 },
  { name: 'windows', category: 'trade', sort_order: 160 },
  { name: 'doors', category: 'trade', sort_order: 170 },
  { name: 'insulation', category: 'trade', sort_order: 180 },
  { name: 'drywall', category: 'trade', sort_order: 190 },
  { name: 'painting', category: 'trade', sort_order: 200 },
  { name: 'flooring', category: 'trade', sort_order: 210 },
  { name: 'tile', category: 'trade', sort_order: 220 },
  { name: 'cabinets', category: 'trade', sort_order: 230 },
  { name: 'countertops', category: 'trade', sort_order: 240 },
  { name: 'trim-and-millwork', category: 'trade', sort_order: 250 },
  { name: 'electrical', category: 'trade', sort_order: 260 },
  { name: 'plumbing', category: 'trade', sort_order: 270 },
  { name: 'hvac', category: 'trade', sort_order: 280 },
  { name: 'landscaping', category: 'trade', sort_order: 290 },
  { name: 'demolition', category: 'trade', sort_order: 300 },
  { name: 'excavation', category: 'trade', sort_order: 310 },

  // Project Stage
  { name: 'pre-construction', category: 'stage', sort_order: 400 },
  { name: 'site-prep', category: 'stage', sort_order: 410 },
  { name: 'rough-in', category: 'stage', sort_order: 420 },
  { name: 'inspection', category: 'stage', sort_order: 430 },
  { name: 'punch-list', category: 'stage', sort_order: 440 },
  { name: 'final-walkthrough', category: 'stage', sort_order: 450 },
  { name: 'post-completion', category: 'stage', sort_order: 460 },

  // Room / Area
  { name: 'kitchen', category: 'area', sort_order: 500 },
  { name: 'bathroom', category: 'area', sort_order: 510 },
  { name: 'bedroom', category: 'area', sort_order: 520 },
  { name: 'living-room', category: 'area', sort_order: 530 },
  { name: 'dining-room', category: 'area', sort_order: 540 },
  { name: 'basement', category: 'area', sort_order: 550 },
  { name: 'attic', category: 'area', sort_order: 560 },
  { name: 'garage', category: 'area', sort_order: 570 },
  { name: 'exterior', category: 'area', sort_order: 580 },
  { name: 'yard', category: 'area', sort_order: 590 },
  { name: 'driveway', category: 'area', sort_order: 600 },
  { name: 'deck-or-patio', category: 'area', sort_order: 610 },
  { name: 'stairs', category: 'area', sort_order: 620 },
  { name: 'hallway', category: 'area', sort_order: 630 },
  { name: 'laundry-room', category: 'area', sort_order: 640 },
  { name: 'office', category: 'area', sort_order: 650 },
  { name: 'mechanical-room', category: 'area', sort_order: 660 },

  // Condition / Issue
  { name: 'damage', category: 'condition', sort_order: 700 },
  { name: 'water-damage', category: 'condition', sort_order: 710 },
  { name: 'mold', category: 'condition', sort_order: 720 },
  { name: 'pest-damage', category: 'condition', sort_order: 730 },
  { name: 'code-violation', category: 'condition', sort_order: 740 },
  { name: 'safety-hazard', category: 'condition', sort_order: 750 },
  { name: 'defect', category: 'condition', sort_order: 760 },
  { name: 'existing-condition', category: 'condition', sort_order: 770 },
  { name: 'progress', category: 'condition', sort_order: 780 },
  { name: 'completed-work', category: 'condition', sort_order: 790 },
  { name: 'before', category: 'condition', sort_order: 800 },
  { name: 'after', category: 'condition', sort_order: 810 },

  // Documentation
  { name: 'receipt', category: 'documentation', sort_order: 900 },
  { name: 'delivery', category: 'documentation', sort_order: 910 },
  { name: 'material-sample', category: 'documentation', sort_order: 920 },
  { name: 'selection', category: 'documentation', sort_order: 930 },
  { name: 'change-order-evidence', category: 'documentation', sort_order: 940 },
  { name: 'warranty-claim', category: 'documentation', sort_order: 950 },
  { name: 'daily-log', category: 'documentation', sort_order: 960 },
  { name: 'client-requested', category: 'documentation', sort_order: 970 },
];
