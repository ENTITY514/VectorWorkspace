-- KTPHUB / VectorWorkspace — initial schema
-- Run in Supabase SQL Editor (once).

-- Extensions
create extension if not exists "pgcrypto";

-- Profiles (must exist before is_admin())
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles helper
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'teacher'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- TUP catalog (metadata + fast snapshot)
create table if not exists public.tup_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default '',
  grade text not null default '',
  language text not null default 'ru',
  program_kind text not null default 'tup' check (program_kind in ('tup', 'tupr')),
  academic_year text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  content_version integer not null default 1,
  plan_json jsonb not null default '[]'::jsonb,
  source_file_path text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tup_documents_status_idx on public.tup_documents (status);
create index if not exists tup_documents_subject_idx on public.tup_documents (subject);
create index if not exists tup_documents_grade_idx on public.tup_documents (grade);
create index if not exists tup_documents_year_idx on public.tup_documents (academic_year);

drop trigger if exists tup_documents_updated_at on public.tup_documents;
create trigger tup_documents_updated_at
  before update on public.tup_documents
  for each row execute function public.set_updated_at();

-- Normalized TUP blocks
create table if not exists public.tup_quarters (
  id uuid primary key default gen_random_uuid(),
  tup_id uuid not null references public.tup_documents (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null,
  repetition_info jsonb not null default '[]'::jsonb
);

create table if not exists public.tup_sections (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.tup_quarters (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null
);

create table if not exists public.tup_topics (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.tup_sections (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null
);

create table if not exists public.tup_objectives (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.tup_topics (id) on delete cascade,
  sort_order integer not null default 0,
  objective_code text,
  description text not null
);

create index if not exists tup_quarters_tup_id_idx on public.tup_quarters (tup_id);
create index if not exists tup_sections_quarter_id_idx on public.tup_sections (quarter_id);
create index if not exists tup_topics_section_id_idx on public.tup_topics (section_id);
create index if not exists tup_objectives_topic_id_idx on public.tup_objectives (topic_id);

-- Published / cloud KTP
create table if not exists public.ktp_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  source_tup_id uuid references public.tup_documents (id) on delete set null,
  subject text not null default '',
  grade text not null default '',
  language text not null default 'ru',
  class_name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  content_version integer not null default 1,
  plan_json jsonb not null default '[]'::jsonb,
  total_hours integer not null default 0,
  quarter_work_hours jsonb not null default '{"q1":0,"q2":0,"q3":0,"q4":0}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ktp_documents_status_idx on public.ktp_documents (status);
create index if not exists ktp_documents_owner_idx on public.ktp_documents (owner_id);
create index if not exists ktp_documents_subject_idx on public.ktp_documents (subject);
create index if not exists ktp_documents_grade_idx on public.ktp_documents (grade);

drop trigger if exists ktp_documents_updated_at on public.ktp_documents;
create trigger ktp_documents_updated_at
  before update on public.ktp_documents
  for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.tup_documents enable row level security;
alter table public.tup_quarters enable row level security;
alter table public.tup_sections enable row level security;
alter table public.tup_topics enable row level security;
alter table public.tup_objectives enable row level security;
alter table public.ktp_documents enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- TUP documents
drop policy if exists "tup_documents_select_published_or_admin" on public.tup_documents;
create policy "tup_documents_select_published_or_admin"
  on public.tup_documents for select
  to authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists "tup_documents_admin_write" on public.tup_documents;
create policy "tup_documents_admin_write"
  on public.tup_documents for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- TUP blocks: readable if parent tup readable; writable by admin
drop policy if exists "tup_quarters_select" on public.tup_quarters;
create policy "tup_quarters_select"
  on public.tup_quarters for select to authenticated
  using (
    exists (
      select 1 from public.tup_documents d
      where d.id = tup_id and (d.status = 'published' or public.is_admin())
    )
  );

drop policy if exists "tup_quarters_admin_write" on public.tup_quarters;
create policy "tup_quarters_admin_write"
  on public.tup_quarters for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tup_sections_select" on public.tup_sections;
create policy "tup_sections_select"
  on public.tup_sections for select to authenticated
  using (
    exists (
      select 1
      from public.tup_quarters q
      join public.tup_documents d on d.id = q.tup_id
      where q.id = quarter_id and (d.status = 'published' or public.is_admin())
    )
  );

drop policy if exists "tup_sections_admin_write" on public.tup_sections;
create policy "tup_sections_admin_write"
  on public.tup_sections for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tup_topics_select" on public.tup_topics;
create policy "tup_topics_select"
  on public.tup_topics for select to authenticated
  using (
    exists (
      select 1
      from public.tup_sections s
      join public.tup_quarters q on q.id = s.quarter_id
      join public.tup_documents d on d.id = q.tup_id
      where s.id = section_id and (d.status = 'published' or public.is_admin())
    )
  );

drop policy if exists "tup_topics_admin_write" on public.tup_topics;
create policy "tup_topics_admin_write"
  on public.tup_topics for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tup_objectives_select" on public.tup_objectives;
create policy "tup_objectives_select"
  on public.tup_objectives for select to authenticated
  using (
    exists (
      select 1
      from public.tup_topics t
      join public.tup_sections s on s.id = t.section_id
      join public.tup_quarters q on q.id = s.quarter_id
      join public.tup_documents d on d.id = q.tup_id
      where t.id = topic_id and (d.status = 'published' or public.is_admin())
    )
  );

drop policy if exists "tup_objectives_admin_write" on public.tup_objectives;
create policy "tup_objectives_admin_write"
  on public.tup_objectives for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- KTP
drop policy if exists "ktp_select_own_or_published" on public.ktp_documents;
create policy "ktp_select_own_or_published"
  on public.ktp_documents for select
  to authenticated
  using (owner_id = auth.uid() or status = 'published' or public.is_admin());

drop policy if exists "ktp_insert_own" on public.ktp_documents;
create policy "ktp_insert_own"
  on public.ktp_documents for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "ktp_update_own" on public.ktp_documents;
create policy "ktp_update_own"
  on public.ktp_documents for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "ktp_delete_own" on public.ktp_documents;
create policy "ktp_delete_own"
  on public.ktp_documents for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Grants (auto-expose tables is off)
grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

grant select, insert, update, delete on public.tup_documents to authenticated;
grant select, insert, update, delete on public.tup_quarters to authenticated;
grant select, insert, update, delete on public.tup_sections to authenticated;
grant select, insert, update, delete on public.tup_topics to authenticated;
grant select, insert, update, delete on public.tup_objectives to authenticated;
grant select, insert, update, delete on public.ktp_documents to authenticated;

-- Storage bucket for original TUP files
insert into storage.buckets (id, name, public)
values ('tup-sources', 'tup-sources', false)
on conflict (id) do nothing;

drop policy if exists "tup_sources_admin_write" on storage.objects;
create policy "tup_sources_admin_write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'tup-sources' and public.is_admin())
  with check (bucket_id = 'tup-sources' and public.is_admin());

drop policy if exists "tup_sources_authenticated_read" on storage.objects;
create policy "tup_sources_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tup-sources');
