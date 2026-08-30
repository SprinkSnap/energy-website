-- Staff roles: owner and employee can access client accounts and projects.

alter table public.profiles
  add column if not exists role text not null default 'client'
    check (role in ('client', 'employee', 'owner'));

alter table public.profiles
  add column if not exists staff_notes text;

alter table public.profiles
  add column if not exists email text;

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'employee')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- Staff can read all profiles (client list).
create policy "profiles_select_staff"
  on public.profiles for select
  using (public.is_staff());

-- Owner can update staff_notes on client accounts.
create policy "profiles_update_owner_notes"
  on public.profiles for update
  using (public.is_owner() and role = 'client')
  with check (public.is_owner() and role = 'client');

-- Staff project access.
create policy "projects_select_staff"
  on public.projects for select
  using (public.is_staff());

create policy "projects_insert_staff"
  on public.projects for insert
  with check (public.is_staff());

create policy "projects_update_staff"
  on public.projects for update
  using (public.is_staff());

create policy "projects_delete_staff"
  on public.projects for delete
  using (public.is_staff());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, company, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'company', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

-- Backfill email for existing profiles (run once).
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');
