# FrameFocus

Construction management SaaS platform for residential and commercial contractors.

## Tech Stack

- **Web:** Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui
- **Mobile:** React Native + Expo
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Monorepo:** Turborepo
- **Hosting:** Vercel (web) + Expo EAS (mobile)

## Getting Started

This project uses GitHub Codespaces. Open a Codespace from the repo and everything is pre-configured.

```bash
# Start the web app
npm run dev:web

# Start the mobile app
npm run dev:mobile

# Build all packages
npm run build
```

## Project Structure

```
framefocus/
├── apps/
│   ├── web/          # Next.js web application
│   └── mobile/       # Expo React Native app
├── packages/
│   ├── shared/       # Shared types, validation, constants, utils
│   ├── supabase/     # Migrations, Edge Functions, seed data
│   └── ui/           # Shared UI primitives (future)
```
