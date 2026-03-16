-- ═══════════════════════════════════════════════════════════════════════════════
--  IronFrame Pro — Test Seed Data
--  Run this AFTER supabase-schema.sql and supabase-rls.sql
--  Creates sample projects, catalog items, and demo data for testing
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Sample Catalog Items ────────────────────────────────────────────────────
INSERT INTO catalog_items (code, name, category, subcategory, unit, unit_cost, labor_cost, description) VALUES
  ('CSI-03100', 'Concrete Formwork',     'Concrete',    'Formwork',     'sf',  4.50,   8.75,  'Standard wood formwork for footings and walls'),
  ('CSI-03300', 'Cast-in-Place Concrete', 'Concrete',    'Placement',    'cy',  145.00, 65.00, '4000 PSI ready-mix with pump placement'),
  ('CSI-03200', 'Rebar #4',              'Concrete',    'Reinforcing',  'lb',  0.85,   0.55,  'Grade 60 reinforcing bar'),
  ('CSI-05120', 'Structural Steel W12',  'Metals',      'Structural',   'lf',  28.50,  15.00, 'W12x26 wide-flange beam'),
  ('CSI-05500', 'Metal Decking',         'Metals',      'Decking',      'sf',  3.25,   2.50,  '1.5" composite floor deck'),
  ('CSI-06100', 'Framing Lumber 2x6',    'Wood',        'Framing',      'lf',  1.45,   1.20,  'SPF #2 dimensional lumber'),
  ('CSI-06160', 'Plywood Sheathing',     'Wood',        'Sheathing',    'sf',  1.85,   0.90,  '3/4" CDX plywood'),
  ('CSI-07210', 'Batt Insulation R-19',  'Insulation',  'Batt',         'sf',  0.95,   0.60,  'Fiberglass batt for 2x6 walls'),
  ('CSI-09250', 'Drywall 5/8"',          'Finishes',    'Gypsum Board', 'sf',  0.72,   1.15,  'Type X fire-rated gypsum board'),
  ('CSI-09900', 'Interior Latex Paint',  'Finishes',    'Painting',     'sf',  0.35,   0.85,  'Two-coat flat latex on drywall'),
  ('CSI-22110', 'Copper Pipe 3/4"',      'Plumbing',    'Supply Pipe',  'lf',  6.50,   8.00,  'Type L copper with solder fittings'),
  ('CSI-26050', 'Romex 12/2 Wire',       'Electrical',  'Wiring',       'lf',  0.55,   2.25,  'NM-B residential branch circuit'),
  ('CSI-31230', 'Excavation',            'Earthwork',   'Trenching',    'cy',  12.00,  0.00,  'Machine excavation with backhoe'),
  ('CSI-32120', 'Asphalt Paving',        'Paving',      'Asphalt',      'sf',  3.50,   2.00,  '2" hot-mix asphalt over prepared base'),
  ('CSI-01500', 'Dumpster Rental 30yd',  'General',     'Waste',        'ea',  475.00, 0.00,  '30-yard roll-off container, 7-day rental')
ON CONFLICT (code) DO NOTHING;

-- ─── Sample Projects ─────────────────────────────────────────────────────────
INSERT INTO projects (name, description, status, address, city, state, zip, budget, start_date, end_date) VALUES
  ('Riverside Office Complex',  'Three-story Class A office build, 45,000 SF total. Steel frame with curtain wall facade.',
    'active', '2400 River Bend Dr', 'Austin', 'TX', '78741', 4250000, '2025-09-15', '2026-08-30'),
  ('Harbor View Condos',        'Luxury waterfront condominiums, 24 units across two buildings. Concrete and steel construction.',
    'active', '850 Marina Blvd', 'Sarasota', 'FL', '34236', 8900000, '2025-06-01', '2027-01-15'),
  ('Oakwood Elementary Reno',   'Full interior renovation of 1960s elementary school. New HVAC, electrical, finishes, and ADA compliance.',
    'planning', '1100 Oakwood Ave', 'Boynton Beach', 'FL', '33435', 1750000, '2026-06-01', '2026-12-15'),
  ('Sunset Strip Retail',       'Ground-up retail strip center, 12,000 SF with 6 tenant spaces.',
    'planning', '4900 W Sunset Blvd', 'Fort Lauderdale', 'FL', '33312', 2100000, '2026-04-01', '2026-11-30')
ON CONFLICT DO NOTHING;

-- ─── Sample Change Orders for Project 1 ──────────────────────────────────────
INSERT INTO change_orders (project_id, co_number, title, description, status, amount) VALUES
  (1, 1, 'Foundation Depth Increase',      'Geotechnical report requires deeper footings on north side. Additional 18" depth across 6 footings.',     'approved', 34500),
  (1, 2, 'Added Emergency Generator',      'Owner requested backup generator for server room. Includes concrete pad, transfer switch, and fuel line.', 'pending',  67800),
  (1, 3, 'Upgraded Lobby Finishes',        'Substitute porcelain tile for VCT in main lobby and elevator vestibule per architect revision.',           'pending',  22100)
ON CONFLICT DO NOTHING;

-- ─── Sample Bid Request ──────────────────────────────────────────────────────
INSERT INTO bid_requests (project_id, title, scope, status, due_date) VALUES
  (1, 'HVAC Package — Riverside Office',
    'Furnish and install complete HVAC system: 3x rooftop units (25-ton each), VAV boxes, ductwork, controls, TAB. See mechanical drawings M-100 through M-112.',
    'open', '2026-04-15'),
  (2, 'Elevator Installation — Harbor View',
    'Two hydraulic passenger elevators, 3-stop, 2500 lb capacity each. Includes cab finishes, controls, and inspection coordination.',
    'open', '2026-04-01')
ON CONFLICT DO NOTHING;
