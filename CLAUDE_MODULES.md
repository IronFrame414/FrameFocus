# CLAUDE_MODULES.md — FrameFocus Module Designs

> **Purpose:** Detailed module designs and cross-cutting workflows. Companion to CLAUDE.md.
> **Last updated:** April 12, 2026

---

## QuickBooks Integration Strategy

**Core principle:** FrameFocus runs daily operations. QuickBooks runs the books. Data syncs so contractors never double-enter.

**Connection:** OAuth 2.0 via QuickBooks Online API. **Owner connects QB** from Company Settings (Admin cannot — this is treated as a billing-adjacent action because it touches financial data flow and Owner is the billing contact of record). Refresh token stored securely. Sync handled by Supabase Edge Functions or webhook queue.

### Sync Points by Module

| Module | FrameFocus → QuickBooks | Direction |
|--------|------------------------|-----------|
| Module 2 (Contacts) | Clients → QB Customers | FF → QB |
| Module 2 (Contacts) | Subs/Vendors (with EIN) → QB Vendors | FF → QB |
| Module 6 (Field Ops) | Approved timesheets → QB Time/Payroll entries | FF → QB |
| Module 7 (Finances) | Client invoices → QB Invoices | FF → QB |
| Module 7 (Finances) | Sub pay applications → QB Bills | FF → QB |
| Module 7 (Finances) | Sub payments → QB Bill Payments | FF → QB |
| Module 7 (Finances) | Approved change orders → QB contract adjustments | FF → QB |

### Key Design Rules

1. **FrameFocus is source of truth for project data.** QB is source of truth for accounting.
2. **Never replace QuickBooks for accounting.** No P&L, no tax prep, no bank reconciliation in FrameFocus.
3. **QB handles 1099s.** Vendor records with EINs and payment totals sync from FrameFocus; QB generates the actual 1099 filings.
4. **Timeclock flow:** Crew member clocks in/out on mobile → Foreman/PM approves timesheet → approved hours sync to QB as time entries tied to employee + job → QB handles payroll.
5. **Vendor markup flows into estimates.** When a vendor is selected for estimate line items, their `default_markup_percent` auto-populates the markup column. Can be overridden per line item. Actual cost vs. marked-up price feeds profit tracking in Module 10.
6. **Build during Modules 6 and 7.** QB connection UI lives in Company Settings. Each financial action optionally syncs.

---

## Change Order Workflow (Detailed)

Change orders span Modules 5, 7, and 9:

**Module 5 (Project Management) — Creation:**
- PM, Admin, or Owner creates a CO tied to a specific project
- References original estimate line items from Module 4
- Shows cost and schedule impact
- Status lifecycle: `draft` → `pending_approval` → `approved` → `rejected` or `executed`
- Hours logged by crew against an approved CO track to the CO's budget bucket (see Module 6)

**Module 7 (Job Finances) — Budget Impact:**
- Approved CO automatically updates project budget (contract value, cost codes, projected profit)
- If CO involves a sub, creates or modifies the sub's pay application
- Approved CO syncs to QuickBooks as contract adjustment

**Module 9 (Client Portal) — Client Sign-off:**
- If CO changes scope or price, it routes to the client for e-signature
- Client sees CO in their portal with before/after comparison
- Signed CO auto-logs to the client Decision Log

**Change Order Approval Chain Workflow:**
PM or Admin creates CO → Owner (and Admin, if Admin did not create it) notified → Owner approves → (if client-facing) client signs via portal → CO marked `executed` → budget auto-updates → QB sync

**Note on Admin involvement:** Admin can create change orders and receives notifications on all CO activity, but **final approval authority stays with the Owner** because change orders affect contract value and money out the door. This is consistent with the principle that Admin has full operational access except for billing and direct financial sign-off.

**Data model (planned):**
- `change_orders` — linked to project, created_by, amounts, description, reason category, status
- `change_order_line_items` — what changed, before/after quantities and prices
- `change_order_approvals` — who approved when
- Document attachments (photos, revised drawings)

---

## Module 3: Document & File Management (Detailed Design)

Module 3 adds cloud file storage, organization, photo markup, and AI auto-tagging.

### Core Features

1. **Project Folders** — Every project auto-gets a folder. Files sorted into sub-folders by category (Photos, Contracts, Plans, Permits, Invoices, Change Orders, Daily Logs, Other).
2. **Company-Level Files** — Files not tied to a project (insurance policies, vendor price lists, templates) live at the company level.
3. **File Tagging** — Flexible labels on any file. Manual tags + AI auto-tags coexist. Searchable.
4. **File Versioning** — Upload a new version of a file → old version marked "superseded" but preserved. Latest version always on top.
5. **Search** — Find files by name, tag, date, project, file type, or uploader.
6. **Favorites / Pinned** — Any user can pin frequently-used files for quick access.

### Photo Markup & Annotation

- **Platforms:** Desktop (mouse/trackpad) and mobile (finger/stylus). Shared component used in Module 3 (web) and reused in Module 6 (mobile field ops).
- **Tools:** Arrows, circles, rectangles, freehand drawing, text labels. Color picker for annotation color.
- **Non-destructive:** Original photo is always preserved. Markup saved as a layer on top. Users can toggle markup on/off, edit existing annotations, or clear all markup.
- **Output:** Marked-up photo exportable as a flattened image (for sharing outside the app) or as original + markup layer (for continued editing).
- **Key use cases:** Punch list items (circle defect, add note), field communication (arrows showing where work goes), change order documentation (mark what changed), quality control.
- **Technical approach (planned):** Canvas-based annotation library (e.g., Fabric.js for web, react-native-canvas or Skia for mobile). Markup data stored as JSON (coordinates, shapes, text) alongside the original file reference. Flattened export generated on demand.

### AI Photo Auto-Tagging

- **Trigger:** Every photo upload (web or mobile) is sent to OpenAI GPT-4o vision API.
- **What the AI tags:** Construction-specific content detected in the image (e.g., "framing", "electrical rough-in", "plumbing", "drywall", "concrete", "roofing", "exterior paint", "damage", "before", "after"). Also auto-tags metadata: date, GPS coordinates, project name, uploader name/role.
- **User control:** AI tags are suggestions — any team member who can view the file can add, edit, or remove tags. AI tags are visually distinguished from manual tags (e.g., different color or icon).
- **No approval needed:** Auto-tagging is internal organization, not client-facing content. Applies instantly on upload.
- **Subscription limits:** Auto-tagging available on all tiers. Usage counted against OpenAI API costs. Consider rate limiting on Starter tier if costs are high.
- **Technical approach (planned):** On file upload, a Supabase Edge Function (or Next.js API route) sends the image to OpenAI's vision endpoint with a system prompt tuned for construction photo classification. Response parsed into tag array and saved to the file's `ai_tags` column. User-added tags stored in a separate `tags` column.
- **Future enhancement:** AI Photo Progress Comparison — AI compares before/after photos and estimates completion percentage. Evaluate after auto-tagging is proven reliable.

### Upload Methods

1. **Web drag-and-drop** — Desktop users drag files or click to browse. Select project + category before uploading.
2. **Mobile camera** — Capture photo from app → AI auto-tags → optional markup → saved to project folder.
3. **Mobile file upload** — Upload from phone storage (PDFs, attachments).
4. **System auto-save** — Generated documents (invoices, proposals, change orders, lien releases, daily log PDFs) auto-file to the correct project folder.
5. **Email forwarding (future)** — Forward email to a FrameFocus address → attachment filed to project. Nice-to-have, not MVP.

### Storage Architecture (planned)

- **Supabase Storage buckets:** One private bucket per file category or one `project-files` bucket with folder structure by `company_id/project_id/category/`.
- **Database table:** `files` table with columns: id, company_id, project_id (nullable for company-level files), category, file_name, file_path (Supabase Storage path), file_size, mime_type, tags[], ai_tags[], version (integer), supersedes_id (FK to previous version), uploaded_by, markup_data (JSONB, nullable), is_favorited_by (array or junction table), is_deleted, created_at, updated_at.
- **RLS:** Any company member can read files in their company. Upload: all team roles. Delete: owner/admin/PM only. Company-level file management: owner/admin only.
- **Storage limits enforced:** Track total storage per company. Compare against subscription tier limit. Block uploads when limit reached. Show usage in billing settings.

### Connections to Later Modules

- **Module 4 (Estimating):** Signed proposals auto-save to project Documents folder.
- **Module 5 (Project Mgmt):** Plans, change order docs filed here. Markup used for change order documentation.
- **Module 6 (Field Ops):** Photo capture + markup reused for daily logs, punch lists, safety incidents. AI auto-tags field photos.
- **Module 7 (Finances):** Invoices, pay apps, lien releases auto-filed. Signed lien releases stored as proof.
- **Module 8 (Inventory & Tools):** Receipts and item photos stored here. Receipt attachments link to inventory items.
- **Module 9 (Client Portal):** Clients see shared files (contracts, photos, change orders). PM controls which files are visible to clients.
- **Module 11 (Marketing):** Best project photos selected for social media posts.

---

## Module 6: Team & Field Operations (Detailed Design)

Module 6 is mobile-first and is where most of the new session 6 planning decisions landed. It covers time tracking, daily logs, safety, deliveries, punch lists, huddles, and offline sync.

### 6.1 Time Tracking (Enhanced)

- **Clock in/out with GPS** — crew taps to clock in, location captured for verification
- **Time categorization** — every time entry tagged as: `regular`, `overtime`, `travel`, `drive`, `shop`. Categories may bill at different rates on T&M jobs.
- **Break tracking** — paid vs. unpaid breaks, lunch tracking. Configurable per company (state labor law varies).
- **Overtime calculation** — auto-flag and track when a crew member crosses 40 hours in a week. OT hours categorized separately.
- **Mileage tracking** — log miles driven for reimbursement (simple odometer start/end or GPS-based).
- **Hours → Task** — when clocking in, crew picks which Module 5 task they are working on.
- **Hours → Change Order** — if the task is part of an approved change order (not original scope), hours track against the CO's budget bucket.
- **Hours → T&M line** — for time & material jobs, hours feed directly into billable lines in Module 7 invoicing.
- **Timesheet approval chain** — Foreman approves crew, PM or Admin approves foreman. Owner can approve at any level. Only approved hours sync to QB.

### 6.2 Daily Logs

- Standard fields: date, project, crew present, weather, work performed, hours, materials delivered, issues
- **Safety Hazards section** — checkbox ("hazards present today?") + text field for description. This is quick in-the-moment hazard logging, NOT a formal incident report.
- Photos auto-pulled from day's captures
- **Voice-to-text** — foreman talks into phone, app transcribes
- End-of-day: auto-generated PDF saved to Module 3

### 6.3 Safety Incident Reporting (Separate from Daily Log Hazards)

A dedicated formal workflow for when something actually happens on site (injury, property damage, near miss). Distinct from the daily log's hazard section.

- Dedicated incident report form: who, what, when, where, witnesses, photos, first aid given, actions taken
- Required fields for OSHA compliance: injury details, body part, time, date, location
- PDF generation auto-saved to Module 3
- Automatic notifications: Owner, Admin, and assigned PM notified immediately
- Company-wide incident log for compliance tracking
- Workflow: Report filed → PDF generated → filed to docs → Owner/Admin/PM notified → incident log updated

### 6.4 Punch Lists

- Quick-add from photo with markup
- Assign, track status (open/in progress/done), priority
- All punch items must close before project can be marked complete
- **Post-launch enhancement:** AI punch list generation from multiple photos, video walkthrough, or audio walkthrough. Uses OpenAI Whisper (transcription) + GPT-4o vision (frame analysis) → AI proposes items → PM reviews and approves. Deferred to post-launch.

### 6.5 Material Delivery Tracking

- Scheduled deliveries tracked with date, vendor, expected contents
- **Anyone assigned to the project** (Owner through Crew, excluding Client) can check in a delivery when it arrives
- Delivery contents recorded two ways: photo of the receipt/packing slip, OR typed list
- Discrepancies flagged on arrival (missing, damaged, wrong items)
- Discrepancies flow into Module 8 inventory as items flagged for return

### 6.6 Daily Huddle / Crew Briefing

- Simple morning briefing tool: Foreman sends daily task list + safety note to crew before work starts
- Crew sees it on their phone via push notification
- **Not mandatory** — not a required daily task. Optional feature to keep everyone aligned when used.

### 6.7 Photo Markup (Mobile)

Uses the shared markup component from Module 3. Same tool set, same non-destructive approach. Reused — not rebuilt.

### 6.8 Offline Mode

- Offline-first architecture for clock in/out, daily logs, photos, punch lists
- Expo SQLite for data, separate cache for photos
- Auto-sync when reconnected
- Last-write-wins for conflict resolution (needs validation in testing)

### 6.9 Data Model Concepts (Planned)

- `time_entries` — user_id, task_id (optional), change_order_id (optional), tm_line_id (optional), category (regular/ot/travel/drive/shop), clock_in, clock_out, gps_in, gps_out, break_minutes, approved_by, approved_at
- `daily_logs` — project_id, date, weather, crew_present[], work_performed, hazards_present (bool), hazard_notes, pdf_file_id
- `safety_incidents` — project_id, incident_date, type, description, injured_person, body_part, witnesses[], actions_taken, photos[], pdf_file_id, reported_by
- `mileage_entries` — user_id, project_id, start_odometer, end_odometer, miles, date
- `material_deliveries` — project_id, vendor_id, scheduled_date, arrived_at, checked_in_by, contents_file_id (receipt photo) OR contents_text (typed list), discrepancies
- `crew_briefings` — project_id, date, sent_by, task_list, safety_note

---

## Module 8: Inventory & Tools (Detailed Design — NEW)

Module 8 was added during Session 6 planning. It tracks two related but distinct things: **inventory** (consumables like lumber, drywall, screws) and **tools** (durables like drills, saws, ladders). Both share structure (categorized items with photos and history) but behave differently.

### 8.1 Inventory (Consumables)

- **Item catalog** — list of inventory items the contractor buys regularly
- **Categories** — lumber, fasteners, concrete, drywall, electrical, plumbing, finishes, consumables, other (flexible, editable)
- **Fields** — name, category, unit of measure (each, box, linear foot, square foot, etc.), default vendor (FK to subcontractors), last cost paid, photo, notes
- **Receipt attachments** — link receipts stored in Module 3 to inventory items (paid what, when, from whom)
- **Assignment to projects** — items allocated to a specific project flow into Module 7's project material budget
- **Return flagging** — simple flag + notes. No automation. Office handles the actual return process manually. Decision: NOT an automated return workflow for launch.

### 8.2 Tools (Durables)

- **Tool catalog** — all tools owned by the contractor
- **Categories** — power tools, hand tools, ladders & scaffolding, safety equipment, measurement, heavy equipment, other
- **Fields** — name, category, brand, model, serial number, purchase date, notes (for specs like blade size, voltage, capacity), photo
- **Current location** — REQUIRED. Options: shop, specific job site (project), truck, custom location
- **Assigned person** — OPTIONAL. Tool can exist without an assigned person. When assigned, tracks who is currently responsible.
- **Check-in/check-out log** — every location change OR assignment change logged: when, from where, to where, who made the change. Full history preserved.
- **Bulk assignment** — select multiple tools at once and assign them to a location in one action (loading a truck for a new job)
- **Notes for specs** — critical specs (blade size, voltage, capacity, hose length) stored in notes so any crew can look them up
- **Photo required** — every tool has a photo for visual identification

### 8.3 Explicitly Deferred to Post-Launch

- **Tool maintenance tracking** — service schedules, oil changes, blade replacements. Post-launch.
- **Low-stock alerts** — automatic reorder notifications. Post-launch.
- **Barcode/QR code scanning** — sticker-and-scan workflow. Post-launch. Manual entry at launch.
- **Automated return workflow** — launch version is just flag + notes. No document generation, no status tracking, no QB credit sync.

### 8.4 Roles & Permissions

- **View inventory and tools** — anyone on the team (Owner through Crew)
- **Add/edit inventory items** — Owner, Admin, PM
- **Check tools in/out, change location, assign person** — anyone on the team (Owner through Crew) — this is deliberate, so the field has access
- **Delete items or tools** — Owner, Admin
- **Flag items for return** — anyone on the team

### 8.5 Data Model Concepts (Planned)

- `inventory_items` — id, company_id, name, category, unit_of_measure, default_vendor_id (FK subcontractors), last_cost, photo_file_id, notes, is_deleted
- `inventory_transactions` — id, company_id, item_id, type (added/used/assigned/returned/flagged_for_return), quantity, project_id (nullable), receipt_file_id, return_notes, created_by, created_at
- `tools` — id, company_id, name, category, brand, model, serial_number, purchase_date, current_location_type (shop/project/truck/custom), current_location_id (nullable, FK to projects if type=project), current_location_custom (nullable text), assigned_to_user_id (nullable), notes, photo_file_id, is_deleted
- `tool_history` — id, tool_id, changed_at, changed_by, previous_location_type, previous_location_id, new_location_type, new_location_id, previous_assignee, new_assignee, notes

### 8.6 Connections

- **Module 2** — inventory items link to subcontractors/vendors as default supplier
- **Module 3** — receipts and item photos stored here; receipt attachments link inventory ↔ files
- **Module 5** — tools and inventory assigned to projects
- **Module 6** — material deliveries from field feed into inventory; tool check-out happens from mobile field app; delivery discrepancies flagged as returns
- **Module 7** — inventory costs flow into project material budgets; T&M materials billable to client

---

## Module 9: Customer Experience Portal (Detailed Design — Updated)

Module 9 gained several features during Session 6 planning: material selections workflow, decision log, client favorites, and pre-construction checklist.

### 9.1 Material Selections Workflow (NEW)

- **Separate pages by category** — flooring, cabinets, countertops, paint, tile, fixtures, appliances, etc. PM or Admin loads options (photos, descriptions, prices) per category.
- **Client picks per category** — visual selection interface
- **Grouped by room** — as selections are made, they populate a room-grouped page (kitchen, master bath, etc.). Clients see all their choices per room together.
- **Finalization** — once all selections made and approved, finalized list becomes the "approved material list" for the project
- **Auto-log to Decision Log** — when a selection category is finalized, it gets logged on the Decision Log as a timestamped record
- **Selection deadlines** — PM or Admin sets deadlines with automated reminders. Example: "Client must pick tile by Friday or framing stops."
- **Decision on deadline enforcement:** Open question (see Known Risks) — soft reminder only vs. blocking project progress.

### 9.2 Decision Log (NEW)

A separate feature from selections. Timestamped record of every significant client decision during the project. Protects the contractor in disputes.

- **Auto-populated** — approved change orders, finalized selections, signed documents all auto-log
- **Manual entries** — Owner, Admin, or PM can log verbal conversations (with client confirmation)
- **Timestamped and attributed** — every entry shows who decided and when, and which role logged the entry
- **Exportable as PDF** — for legal or insurance purposes. Export available to Owner, Admin, PM.
- **Edit history question:** Append-only vs. editable (see Known Risks — leaning append-only for defensibility)

### 9.3 Photo Gallery with Client Favorites (NEW)

- Clients can "heart" photos they love in the gallery
- PM, Admin, and Owner can see which photos resonated with the client
- Client favorites feed into Module 11 marketing as top candidates for social posts

### 9.4 Pre-Construction Checklist (NEW)

- Before work starts: permits pulled, insurance verified, deposit received, HOA approval (if applicable), selections approved, start date agreed
- Managed by Owner, Admin, or PM. Client can see status and help move items forward.

### 9.5 Other Module 9 Features (Existing Plan)

- Client login, project timeline, photo gallery, document access (PM or Admin controls what is shared with the client)
- Change order e-signature
- Invoice viewing and payment (Stripe Connect)
- **Messaging** — client messages with their assigned PM by default. Admin and Owner can also message clients and view all client message threads across projects.
- AI Weekly Summaries (Business tier only, **owner-approved** before client sees them — this is an owner-only approval; Admin cannot approve client-facing AI content)

### 9.6 Data Model Concepts (Planned)

- `material_selection_categories` — project_id, category_name, deadline, status, created_by
- `material_selection_options` — category_id, name, description, price, photo_file_id, created_by
- `material_selections` — category_id, chosen_option_id, finalized_at, finalized_by, room_assignment
- `decision_log` — project_id, decided_at, decision_type (CO/selection/manual/signing), description, actor (client/PM/admin/owner), logged_by_role, source_record_id, is_append_only
- `photo_favorites` — file_id, client_user_id, favorited_at
- `preconstruction_checklist` — project_id, item_name, status, due_date, completed_at, managed_by
