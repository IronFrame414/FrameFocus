# Context — FrameFocus Planning Session (March 29, 2026)

## What happened this session

This was the full strategic planning session for FrameFocus. No code was written. Two documents were produced.

### Decisions made:

1. **Platform scope defined** — 10 modules organized into 4 build phases covering sales/estimating, project management, field operations, job finances, customer experience, reporting, and AI marketing.

2. **Tech stack selected** — Moving away from Flutter. New stack is Next.js (web) + React Native/Expo (mobile) + Supabase (backend) + TypeScript everywhere. Chose React ecosystem over Flutter because UX is the top priority and Flutter's web output isn't good enough for an office-grade SaaS app.

3. **AI integration planned** — AI woven across 6 modules: estimate line-item suggestions from historical data (pgvector), AI-drafted weekly client summaries with owner approval, natural language reporting queries, budget anomaly detection, and AI marketing content generation. Core rule: AI drafts, humans approve.

4. **Workflow automation designed** — 6 built-in workflows including the lien release flow Josh specified (sub completes work → auto-generated lien release for e-signature → signed release unlocks payment). Also: change order approval chains, milestone notifications, estimate follow-ups, insurance expiration alerts, and project closeout sequences.

5. **AI Marketing scoped as Phase 4 premium add-on** — Facebook, Google Business, and website portfolio automation. Positioned as $99/mo add-on to Business tier, not core platform.

6. **Subscription pricing drafted** — 3 tiers: Starter ($79/mo), Professional ($149/mo), Business ($249/mo). Client portal and AI weekly summaries are Business-tier exclusives.

7. **Timeline agreed** — 12 months total. Usable beta at month 5 (Sales & Estimating + Project Management). Feature complete at month 10. Production launch at month 12.

8. **Dev environment chosen** — GitHub Codespaces (browser-based). No local dev setup needed.

9. **Priority ranking established** — Best user experience > Developer simplicity > Scalability > Speed to market.

10. **Claude Code strategy decided** — Don't install yet. Stay in Claude Chat for planning and scaffolding. Once Codespaces is running and Module 1 coding begins, install Claude Code in the Codespace terminal for hands-on coding tasks. Use both tools together: Claude Code for building (components, migrations, services), Claude Chat for planning (architecture, data models, strategy, documents).

11. **Two-layer user architecture defined** — Layer 1: Platform Admins (Josh and future FrameFocus team) manage the platform itself via a separate admin dashboard, stored in a `platform_admins` table with no `company_id`. Layer 2: Company Users are the contractor customers, isolated per tenant. 5 roles within each company: Owner (billing contact, full access, approval authority), Project Manager (estimates, projects, finances), Foreman (field crew management, daily ops, punch lists), Crew Member (clock in/out, daily logs, photos, task updates), and Client (portal-only access to project timeline, payments, documents). Every company must have exactly 1 Owner. Client accounts are unlimited on the Business subscription tier.

### Documents produced:

- **FrameFocus_Development_Roadmap.docx** — 15+ page business roadmap with executive summary, tech stack, all 10 modules detailed with features and deliverables, AI strategy, workflow engine, subscription pricing table, dev environment setup, and month-by-month milestone timeline. This is the business/strategy document.

- **CLAUDE.md** — Technical reference file for the repo root. Contains monorepo structure, database conventions, code conventions, module status tracker, roles/permissions, instruction preferences, and current session context. This is what Claude reads at the start of every dev session.

### What's next (first tasks for next session):

1. Create new GitHub repo (under IronFrame414 account)
2. Scaffold the Turborepo monorepo with the folder structure defined in CLAUDE.md
3. Configure GitHub Codespaces (.devcontainer/devcontainer.json)
4. Set up Supabase project for FrameFocus
5. Connect Vercel for web auto-deployment
6. Begin Module 1: Settings, Admin & Billing
7. When Module 1 coding starts: install Claude Code in the Codespace terminal (`npm install -g @anthropic-ai/claude-code`) and begin using it for hands-on coding alongside Claude Chat for planning

### How to start the next session:

Paste this context.md and say: "Starting a new FrameFocus session. I also have CLAUDE.md and the roadmap doc from last time. Ready to create the repo and scaffold the monorepo."
