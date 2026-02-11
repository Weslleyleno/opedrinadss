-- OPEDRIN ADSS - Supabase schema (run in SQL Editor)

-- 1) Profiles (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  is_admin boolean not null default false,
  chart_mode text not null default 'combo',
  avatar_id text not null default 'crown',
  avatar_url text,
  monthly_goal numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists chart_mode text not null default 'combo';
alter table public.profiles add column if not exists avatar_id text not null default 'crown';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists monthly_goal numeric(12,2) not null default 0;

-- App settings (admin-managed)
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app_settings_select_auth"
on public.app_settings
for select
to authenticated
using (true);

create policy "app_settings_upsert_admin"
on public.app_settings
for insert
to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

create policy "app_settings_update_admin"
on public.app_settings
for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

grant select on public.app_settings to authenticated;

-- Monthly ranking RPC (bypasses RLS when owned by postgres)
create or replace function public.get_ranking_monthly(month_start date, month_end date)
returns table (
  user_id uuid,
  username text,
  avatar_id text,
  avatar_url text,
  monthly_goal numeric,
  total_result numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    p.avatar_id,
    p.avatar_url,
    p.monthly_goal,
    coalesce(sum(o.result), 0)::numeric(12,2) as total_result
  from public.profiles p
  left join public.operations o
    on o.user_id = p.id
   and o.op_date >= month_start
   and o.op_date <= month_end
  group by p.id, p.username, p.avatar_id, p.avatar_url, p.monthly_goal
  order by total_result desc;
$$;

grant execute on function public.get_ranking_monthly(date, date) to authenticated;

-- Monthly awards (prize + winner snapshot per month)
create table if not exists public.monthly_awards (
  ym text primary key,
  reward text not null default '',
  reward_image text not null default '',
  winner_user_id uuid,
  winner_username text,
  winner_avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monthly_awards enable row level security;

create policy "monthly_awards_select"
on public.monthly_awards
for select
to authenticated
using (true);

create policy "monthly_awards_admin_write"
on public.monthly_awards
for insert
to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

create policy "monthly_awards_admin_update"
on public.monthly_awards
for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

grant select on public.monthly_awards to authenticated;
grant insert, update on public.monthly_awards to authenticated;

-- Central de recursos (global: todos podem ver e editar)
create table if not exists public.resources (
  id bigserial primary key,
  title text not null,
  url text,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resources enable row level security;

create policy "resources_select"
on public.resources
for select
to authenticated
using (true);

create policy "resources_insert"
on public.resources
for insert
to authenticated
with check (true);

create policy "resources_update"
on public.resources
for update
to authenticated
using (true)
with check (true);

create policy "resources_delete"
on public.resources
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.resources to authenticated;

create table if not exists public.central_pages (
  key text primary key,
  content text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.central_pages enable row level security;

create policy "central_pages_select"
on public.central_pages
for select
to authenticated
using (true);

create policy "central_pages_insert"
on public.central_pages
for insert
to authenticated
with check (true);

create policy "central_pages_update"
on public.central_pages
for update
to authenticated
using (true)
with check (true);

create policy "central_pages_delete"
on public.central_pages
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.central_pages to authenticated;

create table if not exists public.creatives (
  id bigserial primary key,
  token text not null,
  status text not null default 'Disponível',
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creatives enable row level security;

create policy "creatives_select"
on public.creatives
for select
to authenticated
using (true);

create policy "creatives_insert"
on public.creatives
for insert
to authenticated
with check (true);

create policy "creatives_update"
on public.creatives
for update
to authenticated
using (true)
with check (true);

create policy "creatives_delete"
on public.creatives
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.creatives to authenticated;

create table if not exists public.creative_statuses (
  id bigserial primary key,
  name text not null unique,
  color text not null default '#22c55e',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.creative_statuses enable row level security;

create policy "creative_statuses_select"
on public.creative_statuses
for select
to authenticated
using (true);

create policy "creative_statuses_insert"
on public.creative_statuses
for insert
to authenticated
with check (true);

create policy "creative_statuses_update"
on public.creative_statuses
for update
to authenticated
using (true)
with check (true);

create policy "creative_statuses_delete"
on public.creative_statuses
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.creative_statuses to authenticated;

create table if not exists public.proxies (
  id bigserial primary key,
  name text not null,
  proxy text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.proxies enable row level security;

create policy "proxies_select"
on public.proxies
for select
to authenticated
using (true);

create policy "proxies_insert"
on public.proxies
for insert
to authenticated
with check (true);

create policy "proxies_update"
on public.proxies
for update
to authenticated
using (true)
with check (true);

create policy "proxies_delete"
on public.proxies
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.proxies to authenticated;

-- 2) Operations
create table if not exists public.operations (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  op_date date not null,
  profit numeric(12,2) not null default 0,
  operational_cost numeric(12,2) not null default 0,
  result numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- allow multiple operations per day
);

alter table public.operations drop constraint if exists operations_unique_user_date;
create index if not exists operations_user_date_idx on public.operations (user_id, op_date);

-- 3) Ranking view (global)
create or replace view public.ranking_global as
select
  p.username as username,
  p.avatar_id as avatar_id,
  p.avatar_url as avatar_url,
  coalesce(sum(o.result), 0)::numeric(12,2) as total_result
from public.profiles p
left join public.operations o on o.user_id = p.id
group by p.username, p.avatar_id, p.avatar_url;

-- 4) RLS
alter table public.profiles enable row level security;
alter table public.operations enable row level security;

-- Profiles policies
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Operations policies
create policy "operations_select_own"
on public.operations
for select
to authenticated
using (user_id = auth.uid());

create policy "operations_insert_own"
on public.operations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "operations_update_own"
on public.operations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "operations_delete_own"
on public.operations
for delete
to authenticated
using (user_id = auth.uid());

-- Ranking: expose to authenticated users
grant select on public.ranking_global to authenticated;
