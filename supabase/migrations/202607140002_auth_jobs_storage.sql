-- Auth, email OTP login, private document storage, searchable records, and scheduled-job ledger.
-- Run after 202607140001_enterprise_controls.sql.

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  business_date date not null,
  status text not null check (status in ('running','completed','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  unique (job_name, business_date)
);

create table if not exists public.daily_interest_accruals (
  id uuid primary key default gen_random_uuid(),
  loan_account_no text not null,
  business_date date not null,
  branch_code text,
  opening_principal numeric(18,2) not null,
  annual_rate numeric(9,4) not null,
  accrued_interest numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique (loan_account_no, business_date)
);

alter table public.job_runs enable row level security;
alter table public.daily_interest_accruals enable row level security;

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select role from public.user_profiles where id = auth.uid()), '') $$;

create or replace function public.app_branch()
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select branch_code from public.user_profiles where id = auth.uid()), '') $$;

create or replace function public.has_verified_session()
returns boolean language sql stable as $$ select auth.uid() is not null $$;

create or replace function public.has_global_access()
returns boolean language sql stable as $$ select public.app_role() in ('it_admin','ops_manager','audit_team','executive') $$;

drop policy if exists "profile_self_or_admin_read" on public.user_profiles;
drop policy if exists "profiles_admin_manage" on public.user_profiles;
create policy "profile_self_or_admin_read" on public.user_profiles for select to authenticated
using (id = auth.uid() or public.app_role() = 'it_admin');
create policy "profiles_admin_manage" on public.user_profiles for all to authenticated
using (public.app_role() = 'it_admin') with check (public.app_role() = 'it_admin');

create or replace function public.branch_access(record_data jsonb)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare record_branch text;
begin
  if public.has_global_access() then return true; end if;
  record_branch := coalesce(record_data->>'branch_code', record_data->>'branch');
  if record_branch is null and to_regclass('public.loans') is not null then
    select data->>'branch_code' into record_branch from public.loans where id = record_data->>'loan_account_no' limit 1;
  end if;
  return record_branch is not null and record_branch = public.app_branch();
end;
$$;

-- Provision a minimal profile whenever a Supabase Auth user is created. An IT
-- admin must assign the real role and branch before the employee receives data access.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'employee', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Private object storage; documents are accessed only through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-documents', 'loan-documents', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "aa2_private_documents_read" on storage.objects;
create policy "aa2_private_documents_read" on storage.objects for select to authenticated
using (bucket_id = 'loan-documents' and public.has_verified_session() and (public.has_global_access() or (storage.foldername(name))[1] = public.app_branch()));
drop policy if exists "aa2_private_documents_write" on storage.objects;
create policy "aa2_private_documents_write" on storage.objects for insert to authenticated
with check (bucket_id = 'loan-documents' and public.has_verified_session() and public.app_role() in ('it_admin','ops_manager','branch_manager','credit_officer','field_officer') and (storage.foldername(name))[1] = public.app_branch());
drop policy if exists "aa2_private_documents_delete" on storage.objects;
create policy "aa2_private_documents_delete" on storage.objects for delete to authenticated
using (bucket_id = 'loan-documents' and public.has_verified_session() and public.app_role() in ('it_admin','ops_manager','branch_manager') and (public.has_global_access() or (storage.foldername(name))[1] = public.app_branch()));

-- Harden the legacy JSON records. Application writes are still checked at the
-- database, even if a browser request is manipulated.
do $$
declare t text;
begin
  foreach t in array array['customers','loans','repayment_schedule','transactions','documents','grievances','investors','investor_txns']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists branch_isolation on public.%I', t);
      execute format('drop policy if exists enterprise_read on public.%I', t);
      execute format('drop policy if exists enterprise_write on public.%I', t);
      execute format('create policy enterprise_read on public.%I for select to authenticated using (public.has_verified_session() and public.branch_access(data))', t);
      execute format('create policy enterprise_write on public.%I for insert to authenticated with check (public.has_verified_session() and public.app_role() in (''it_admin'',''ops_manager'',''branch_manager'',''credit_officer'') and public.branch_access(data))', t);
      execute format('create policy enterprise_update on public.%I for update to authenticated using (public.has_verified_session() and public.app_role() in (''it_admin'',''ops_manager'',''branch_manager'',''credit_officer'',''cashier'',''field_officer'') and public.branch_access(data)) with check (public.has_verified_session() and public.branch_access(data))', t);
    end if;
  end loop;
end $$;

-- The app's search endpoint uses these database-side indexes, not browser-side filtering.
do $$
begin
  if to_regclass('public.customers') is not null then
    alter table public.customers add column if not exists search_document tsvector generated always as (to_tsvector('simple', coalesce(data->>'full_name', '') || ' ' || coalesce(data->>'customer_id', '') || ' ' || coalesce(data->>'mobile', '') || ' ' || coalesce(data->>'father_husband_name', '') || ' ' || coalesce(data->>'village_city', ''))) stored;
    create index if not exists customers_search_document_idx on public.customers using gin (search_document);
    execute 'create index if not exists customers_search_idx on public.customers using gin (to_tsvector(''simple'', coalesce(data->>''full_name'', '''') || '' '' || coalesce(data->>''customer_id'', '''') || '' '' || coalesce(data->>''mobile'', '''')))';
  end if;
  if to_regclass('public.loans') is not null then
    alter table public.loans add column if not exists search_document tsvector generated always as (to_tsvector('simple', coalesce(data->>'loan_account_no', '') || ' ' || coalesce(data->>'member_name_cache', '') || ' ' || coalesce(data->>'member_name', '') || ' ' || coalesce(data->>'customer_id', '') || ' ' || coalesce(data->>'branch_code', ''))) stored;
    create index if not exists loans_search_document_idx on public.loans using gin (search_document);
    execute 'create index if not exists loans_search_idx on public.loans using gin (to_tsvector(''simple'', coalesce(data->>''loan_account_no'', '''') || '' '' || coalesce(data->>''member_name_cache'', '''') || '' '' || coalesce(data->>''customer_id'', '''')))';
  end if;
end $$;

-- Fix the audit function return and prevent regular users modifying job results.
create or replace function public.write_audit_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare prior_hash text; before_record jsonb; after_record jsonb; record_id text;
begin
  before_record := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_record := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  record_id := coalesce(after_record->>'id', before_record->>'id', 'unknown');
  select event_hash into prior_hash from public.audit_events order by occurred_at desc, id desc limit 1;
  insert into public.audit_events (actor_id, actor_email, action, entity_type, entity_id, branch_code, before_data, after_data, previous_hash, event_hash)
  values (auth.uid(), auth.jwt()->>'email', tg_op, tg_table_name, record_id, coalesce(after_record->>'branch_code', after_record->'data'->>'branch_code', before_record->>'branch_code', before_record->'data'->>'branch_code'), before_record, after_record, prior_hash, encode(digest(coalesce(prior_hash, '') || tg_op || tg_table_name || record_id || coalesce(after_record, before_record)::text || clock_timestamp()::text, 'sha256'), 'hex'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
