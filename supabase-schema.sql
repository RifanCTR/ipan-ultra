
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  recovery_email text not null,
  created_at timestamptz not null default now(),
  constraint username_format check (
    username ~ '^[a-zA-Z0-9_]{3,24}$'
  )
);

create unique index if not exists profiles_recovery_email_idx
on public.profiles (lower(recovery_email));

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  activity_type text not null default 'Lari',
  activity_date date not null,
  distance_km numeric(10,2) not null check (distance_km > 0),
  duration_minutes numeric(12,2) not null check (duration_minutes > 0),
  elevation_m integer not null default 0 check (elevation_m >= 0),
  feeling text not null default 'Nyaman',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_user_date_idx
on public.activities (user_id, activity_date desc);

alter table public.profiles enable row level security;
alter table public.activities enable row level security;

drop policy if exists "profile owner select" on public.profiles;
create policy "profile owner select"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profile owner update" on public.profiles;
create policy "profile owner update"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "activity owner select" on public.activities;
create policy "activity owner select"
on public.activities for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "activity owner insert" on public.activities;
create policy "activity owner insert"
on public.activities for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "activity owner update" on public.activities;
create policy "activity owner update"
on public.activities for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "activity owner delete" on public.activities;
create policy "activity owner delete"
on public.activities for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_email text;
begin
  requested_username :=
    lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  requested_email :=
    lower(trim(coalesce(new.email, '')));

  if requested_username !~ '^[a-zA-Z0-9_]{3,24}$' then
    raise exception 'Username harus 3-24 karakter: huruf, angka, atau underscore.';
  end if;

  insert into public.profiles (
    id, username, recovery_email
  )
  values (
    new.id, requested_username, requested_email
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
