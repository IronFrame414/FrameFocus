-- ═══════════════════════════════════════════════════════════════════════════════
--  IronFrame Pro — Row Level Security Policies
--  Run this in the Supabase SQL Editor AFTER supabase-schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table users enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table contracts enable row level security;
alter table estimates enable row level security;
alter table estimate_line_items enable row level security;
alter table change_orders enable row level security;
alter table catalog_items enable row level security;
alter table bid_requests enable row level security;
alter table bids enable row level security;
alter table time_entries enable row level security;
alter table daily_logs enable row level security;
alter table photos enable row level security;
alter table notifications enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: get current user's app role from the users table
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_role()
returns text as $$
  select role from users where id = auth.uid()::bigint;
$$ language sql security definer stable;

create or replace function get_my_id()
returns bigint as $$
  select id from users where email = auth.jwt()->>'email';
$$ language sql security definer stable;

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS: everyone can read, only admins can modify others
-- ─────────────────────────────────────────────────────────────────────────────
create policy "users_select" on users for select
  using (true);

create policy "users_insert" on users for insert
  with check (true);

create policy "users_update_own" on users for update
  using (email = auth.jwt()->>'email');

create policy "users_update_admin" on users for update
  using (get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- PROJECTS: all authenticated users can read, owners/admins can write
-- ─────────────────────────────────────────────────────────────────────────────
create policy "projects_select" on projects for select
  using (true);

create policy "projects_insert" on projects for insert
  with check (get_my_role() in ('admin','owner'));

create policy "projects_update" on projects for update
  using (get_my_role() in ('admin','owner'));

create policy "projects_delete" on projects for delete
  using (get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- PROJECT_MEMBERS: all can read, owners/admins can modify
-- ─────────────────────────────────────────────────────────────────────────────
create policy "pm_select" on project_members for select
  using (true);

create policy "pm_insert" on project_members for insert
  with check (get_my_role() in ('admin','owner'));

create policy "pm_delete" on project_members for delete
  using (get_my_role() in ('admin','owner'));

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTRACTS: all can read, owners/admins can write
-- ─────────────────────────────────────────────────────────────────────────────
create policy "contracts_select" on contracts for select
  using (true);

create policy "contracts_insert" on contracts for insert
  with check (get_my_role() in ('admin','owner'));

create policy "contracts_update" on contracts for update
  using (get_my_role() in ('admin','owner'));

-- ─────────────────────────────────────────────────────────────────────────────
-- ESTIMATES: all can read, all can create
-- ─────────────────────────────────────────────────────────────────────────────
create policy "estimates_select" on estimates for select
  using (true);

create policy "estimates_insert" on estimates for insert
  with check (true);

create policy "estimates_update" on estimates for update
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- ESTIMATE_LINE_ITEMS: follow parent estimate access
-- ─────────────────────────────────────────────────────────────────────────────
create policy "eli_select" on estimate_line_items for select
  using (true);

create policy "eli_insert" on estimate_line_items for insert
  with check (true);

create policy "eli_update" on estimate_line_items for update
  using (true);

create policy "eli_delete" on estimate_line_items for delete
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHANGE_ORDERS: all read, owners/foremen/admins create, owners/admins approve
-- ─────────────────────────────────────────────────────────────────────────────
create policy "co_select" on change_orders for select
  using (true);

create policy "co_insert" on change_orders for insert
  with check (get_my_role() in ('admin','owner','foreman'));

create policy "co_update" on change_orders for update
  using (get_my_role() in ('admin','owner'));

-- ─────────────────────────────────────────────────────────────────────────────
-- CATALOG_ITEMS: all read, owners/admins write
-- ─────────────────────────────────────────────────────────────────────────────
create policy "catalog_select" on catalog_items for select
  using (true);

create policy "catalog_insert" on catalog_items for insert
  with check (get_my_role() in ('admin','owner'));

create policy "catalog_update" on catalog_items for update
  using (get_my_role() in ('admin','owner'));

-- ─────────────────────────────────────────────────────────────────────────────
-- BID_REQUESTS + BIDS: all read, owners/foremen/admins create
-- ─────────────────────────────────────────────────────────────────────────────
create policy "br_select" on bid_requests for select
  using (true);

create policy "br_insert" on bid_requests for insert
  with check (get_my_role() in ('admin','owner','foreman'));

create policy "br_update" on bid_requests for update
  using (get_my_role() in ('admin','owner'));

create policy "bids_select" on bids for select
  using (true);

create policy "bids_insert" on bids for insert
  with check (true);

create policy "bids_update" on bids for update
  using (get_my_role() in ('admin','owner'));

-- ─────────────────────────────────────────────────────────────────────────────
-- TIME_ENTRIES: users see all, create their own, foremen/admins approve
-- ─────────────────────────────────────────────────────────────────────────────
create policy "te_select" on time_entries for select
  using (true);

create policy "te_insert" on time_entries for insert
  with check (true);

create policy "te_update" on time_entries for update
  using (get_my_role() in ('admin','owner','foreman'));

-- ─────────────────────────────────────────────────────────────────────────────
-- DAILY_LOGS: all read, all create
-- ─────────────────────────────────────────────────────────────────────────────
create policy "dl_select" on daily_logs for select
  using (true);

create policy "dl_insert" on daily_logs for insert
  with check (true);

create policy "dl_update" on daily_logs for update
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHOTOS: all read, all upload
-- ─────────────────────────────────────────────────────────────────────────────
create policy "photos_select" on photos for select
  using (true);

create policy "photos_insert" on photos for insert
  with check (true);

create policy "photos_update" on photos for update
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS: users see only their own
-- ─────────────────────────────────────────────────────────────────────────────
create policy "notif_select" on notifications for select
  using (user_id = get_my_id());

create policy "notif_insert" on notifications for insert
  with check (true);

create policy "notif_update" on notifications for update
  using (user_id = get_my_id());

-- ═══════════════════════════════════════════════════════════════════════════════
--  Storage bucket for photos and file uploads
-- ═══════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
  values ('project-files', 'project-files', true)
  on conflict do nothing;

create policy "storage_upload" on storage.objects for insert
  with check (bucket_id = 'project-files');

create policy "storage_read" on storage.objects for select
  using (bucket_id = 'project-files');

create policy "storage_update" on storage.objects for update
  using (bucket_id = 'project-files');
