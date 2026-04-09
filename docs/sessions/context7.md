# Context — FrameFocus Planning Session (April 6-8, 2026)

## What happened this session

This was Session 6 — a pure planning and documentation session. No code was written. The full platform roadmap was expanded with several new modules, features, and workflows, and four major reference documents were produced.

### Session structure

The session ran across two days with a single conversation thread:
- **Day 1:** Module 3 deep-dive planning, photo markup + AI auto-tagging decisions, first spreadsheet produced
- **Day 2:** New modules, workflow expansions, Word documents produced, CLAUDE.md and context7.md updates

---

## Major decisions made this session

### 1. Platform expanded from 10 to 11 modules

**Module 8 added: Inventory & Tools (NEW)**
- Added after Module 7 (Finances), before Client Portal
- Covers both consumable inventory and durable tools in one module
- Bumped all subsequent module numbers:
  - Old Module 8 (Client Portal) → now Module 9
  - Old Module 9 (Reporting) → now Module 10
  - Old Module 10 (AI Marketing) → now Module 11

### 2. Module 3 detailed design finalized

- File categories, project folders, tags, versioning, search, favorites
- **Photo markup and annotation** — works on desktop AND mobile. Non-destructive (original preserved, markup saved as layer). Shared component reused in Module 6. Tools: arrows, circles, rectangles, freehand, text, color picker.
- **AI photo auto-tagging** — every uploaded photo sent to OpenAI GPT-4o vision → auto-tagged with construction content (framing, electrical, plumbing, damage, etc.) plus metadata (date, GPS, project, uploader). Tags apply instantly (exception to "AI drafts, humans approve" rule because it's internal organization only). Users can edit any tag.
- **Receipt attachments** — receipts stored in Module 3 can be linked to Module 8 inventory items

### 3. Module 6 significantly expanded

All added this session:

**Time tracking enhancements:**
- **Time categorization** — every time entry tagged as regular / overtime / travel / drive / shop. Categories may bill at different rates on T&M jobs.
- **Break tracking** — paid vs. unpaid breaks, lunch, configurable per company
- **Overtime calculation** — auto-flag when crew crosses 40 hours/week
- **Mileage tracking** — miles driven for reimbursement
- **Hours allocated to tasks, change orders, or T&M billing lines** — crew picks which bucket when clocking in

**Safety:**
- **Safety hazards section in daily logs** — quick checkbox + text field for "hazards present today"
- **Separate Safety Incident Reporting workflow** — formal incident reports with OSHA-ready fields, PDF generation, instant Owner/PM notifications, company-wide incident log

**Communication:**
- **Daily huddle / crew briefing** — Foreman sends morning task list + safety note to crew. Optional (not a mandatory daily task).

**Material deliveries:**
- **Material delivery tracking** — scheduled deliveries tracked, checked in on arrival by anyone assigned to the project (Owner through Crew), contents recorded via receipt photo OR typed list, discrepancies flagged and flowed to Module 8 inventory as returns

**Mobile features:**
- Voice-to-text daily logs
- Offline-first photo queue with auto-upload
- Quick-add punch list from photo
- **Post-launch:** AI punch list generation from multiple photos, video walkthrough, or audio walkthrough (uses Whisper + GPT-4o vision)

### 4. Module 8 (Inventory & Tools) detailed design

**Inventory (consumables):**
- Categorized items (lumber, fasteners, concrete, drywall, electrical, plumbing, finishes, consumables, other)
- Fields: name, category, unit of measure, default vendor (FK to subcontractors), last cost, photo, notes
- Receipt attachments linked from Module 3
- Items can be assigned to projects (cost flows to Module 7 material budgets)
- **Return flagging** — simple flag + notes only. No automation. Office handles the actual return manually.

**Tools (durables):**
- Categorized (power tools, hand tools, ladders, safety, measurement, heavy equipment, other)
- Fields: name, category, brand, model, serial, photo, notes (for specs like blade size, voltage, capacity)
- **Current location REQUIRED** — shop, specific job site (project), truck, or custom
- **Assigned person OPTIONAL** — tools can exist without an assigned person
- **Check-in/check-out log** — every location or assignment change logged with who/when/from/to
- **Bulk assignment** — select multiple tools and assign to a location in one action
- **All roles (Owner through Crew) can check tools in/out** — deliberate; field access matters

**Deferred to post-launch:**
- Tool maintenance tracking (service schedules, oil changes)
- Low-stock alerts
- Barcode/QR code scanning
- Automated return workflow (document generation, status tracking, QB credit sync)

### 5. Module 9 (Client Portal) expanded

**Material Selections Workflow (NEW):**
- Separate pages per category (flooring, cabinets, countertops, paint, tile, fixtures, appliances)
- PM loads options, client picks
- Selections populate a room-grouped final material list
- When a category is finalized → auto-logs to the Decision Log
- Selection deadlines with automated reminders

**Decision Log (NEW):**
- Timestamped record of every significant client decision
- Auto-populated from approved change orders, finalized selections, signed documents
- Manual entries allowed (for logging verbal conversations)
- Exportable as PDF for legal/insurance purposes
- Leaning append-only (for legal defensibility, but this is still an open question)

**Photo Gallery Client Favorites (NEW):**
- Clients can "heart" photos they love
- Favorites feed Module 11 marketing as top social post candidates

**Pre-Construction Checklist (NEW):**
- Permits pulled, insurance verified, deposit received, HOA approval, selections approved, start date agreed
- Lives partly in client portal so client can help move items forward

### 6. New workflows added

On top of the original 6 built-in workflows:

7. **Daily Log Auto-Report** — compile daily log + photos + safety → PDF → filed to Module 3 → PM notified
8. **Safety Incident Report** — incident filed → PDF generated → saved → Owner/PM notified → company incident log updated
9. **New Client Welcome Package** — lead → client → portal account → welcome email → signed proposal filed → QB Customer sync
10. **Sub Payment Processing** — pay app → PM reviews → Owner releases → payment recorded → QB sync → retainage tracked
11. **Material Delivery Arrival** — delivery arrives → any project member checks in → receipt photo or typed list → discrepancies → flow to Module 8 returns
12. **Material Selection Finalization** — client finalizes a category → auto-log to Decision Log → approved material list updated

### 7. Explicitly canceled

- **Weather-based work cancellation** — canceled outright, not building
- **Customer referral tracking** — canceled outright, not building

### 8. Barcode/QR scanning decision

User asked for initial build, but after scope discussion: deferred to post-launch. Manual entry at launch. Barcode scanning ships later.

### 9. Supplemental sections in reference documents

User requested all 12 supplemental sections in the comprehensive doc:
1. How to read this document
2. Glossary of terms
3. Design principles (golden rules)
4. Success metrics per module
5. Known risks and open questions
6. Competitor context (brief paragraph)
7. Subscription tier summary
8. Beta testing plan (placeholder)
9. Post-launch roadmap
10. Module dependency map
11. Data flow between modules
12. Tech stack summary

---

## Open questions parked in the Known Risks section

These came up during planning but weren't resolved. They need decisions before the affected modules are built:

1. **AI cost at scale** — photo auto-tagging + estimate suggestions + AI content all have per-call costs. If Starter tier usage is high, economics may not work. Mitigation: rate limit per tier, monitor during beta.
2. **Offline sync conflicts** — two crew members edit the same daily log offline, both come back online, who wins? Current plan: last-write-wins. Needs validation.
3. **Photo storage at scale** — 200 GB on Business may not be enough for high-volume commercial contractors.
4. **Mobile performance** — heavy features (markup, offline sync, AI) need testing on low-end Android.
5. **QuickBooks sync edge cases** — what if contractor edits a synced invoice directly in QB? Current design is one-way FF→QB; this could create drift.
6. **Crew adoption** — biggest product risk. If foremen don't use the mobile app, the field ops value prop collapses. Needs extreme simplicity.
7. **Inventory unit conversions** — buying lumber by the board-foot but using it by the piece. Needs conversion layer OR keep simple and require consistent units.
8. **T&M rate structure** — per employee (flexible but admin-heavy) or per role (simpler)? Needs decision before Module 6 build.
9. **Photo markup storage format** — JSON (coordinates of shapes, editable) or rendered image (simpler, loses editability)? Leaning JSON.
10. **Client portal messaging** — real-time (chat) or async (email)? Real-time is more work.
11. **Selection deadline enforcement** — soft reminder only, or auto-block project progress? Needs policy decision.
12. **Decision log edit history** — append-only (more defensible legally) or editable (less forgiving of mistakes)? Leaning append-only.

---

## Deliverables produced this session

1. **`FrameFocus_Platform_Roadmap.xlsx`** — 8-tab planning spreadsheet:
   - Platform Overview
   - Module 3 Documents (detailed)
   - Integrations
   - Workflows
   - AI Features
   - Roles & Permissions
   - Ideas & Future Features
   - QuickBooks Sync Detail

2. **`FrameFocus_Platform_Roadmap.docx`** — 51-page comprehensive reference document with all 29 sections (executive summary, 11 module details, cross-cutting systems, workflows, AI features, roles, dependency map, data flow, build order, success metrics, known risks, beta plan placeholder, post-launch roadmap, all 12 supplemental sections). 10th grade reading level.

3. **`FrameFocus_Quick_Reference.docx`** — 5-page scannable summary for someone familiar with the plan to review and suggest additions. Covers all 11 modules, new/notable features per module, all workflows in a table, AI features, roles summary, build timeline, and deferred items.

4. **`CLAUDE.md` updated** — technical dev guide updated to reflect:
   - 11-module structure (Module 8 is new)
   - Module 6 expansions (time categorization, safety, deliveries, huddles)
   - Module 8 detailed design (inventory + tools)
   - Module 9 expansions (selections, decision log, favorites, checklist)
   - New workflows (7-12)
   - Updated database tables (Module 6, 8, 9 planned tables)
   - Updated AI layer references
   - Updated reference documents list

5. **`context7.md`** — this file.

---

## What's next (first tasks for next session)

1. **Answer the parked open questions** — at minimum, T&M rate structure and photo markup storage format need to be decided before Module 3 starts.
2. **Run audit fixes from Session 5** — fix `import type` in 4 client component files, consolidate US_STATES, TRADE_TYPES, LEAD_SOURCES into `packages/shared/constants/form-options.ts`, consolidate CompanyData interface into shared types.
3. **Set up OpenAI API key in env vars** — needed for Module 3 photo auto-tagging. Add `OPENAI_API_KEY` to both `.env.local` and Vercel before Module 3 build begins.
4. **Begin Module 3 build** — Document & File Management. Follow the detailed design in the new CLAUDE.md section. Build in this order:
   - Migration for `files` table + RLS
   - Supabase Storage bucket `project-files`
   - Server service (`files.ts`) + client service (`files-client.ts`)
   - Upload component (web drag-and-drop)
   - File list page with filtering
   - Category/project folder navigation
   - Tag editing
   - Photo markup component (Fabric.js web, Skia or react-native-canvas mobile — research needed)
   - OpenAI vision integration for auto-tagging (Edge Function or API route)
   - Receipt attachment linking (placeholder for Module 8, full feature when Module 8 ships)

---

## Known accounts (unchanged from Session 5)

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Stripe:** FrameFocus sandbox (test mode)
- **OpenAI:** To be set up before Module 3 build
- **Test users:** Josh Bishop (jsbishop14@gmail.com) Owner of Bishop Contracting

---

## How to start the next session

Paste this `context7.md` plus the updated `CLAUDE.md` and say:

> "Starting a new FrameFocus session. I have the updated CLAUDE.md and context7.md from the Session 6 planning work. Ready to [answer open questions / run audit fixes / start Module 3 build]."

Reference the `FrameFocus_Platform_Roadmap.docx` if you need the full detail on any module or workflow. The Quick Reference is good for refreshing memory on the overall shape.
