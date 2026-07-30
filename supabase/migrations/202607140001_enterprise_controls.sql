-- AA2 Finance enterprise control plane.
-- Apply through the Supabase SQL editor or `supabase db push` before enabling
-- the production application. This migration does not delete legacy data.

create extension if not exists pgcrypto;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('it_admin','branch_manager','field_officer','credit_officer','cashier','audit_team','ops_manager','executive','investor','employee')),
  branch_code text references public.branches(code),
  active boolean not null default true,
  ip_allowlist cidr[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  branch_code text,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  source_ip inet,
  previous_hash text,
  event_hash text not null unique
);

create index if not exists audit_events_occurred_at_idx on public.audit_events (occurred_at desc);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- Each event includes the previous event hash, creating a verifiable chain.
create or replace function public.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  prior_hash text;
  before_record jsonb;
  after_record jsonb;
  record_id text;
  raw_payload text;
  computed_hash text;
begin
  before_record := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_record := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  record_id := coalesce(after_record->>'id', before_record->>'id', 'unknown');
  select event_hash into prior_hash from public.audit_events order by occurred_at desc, id desc limit 1;
  raw_payload := coalesce(prior_hash, '') || tg_op || tg_table_name || record_id || coalesce(after_record, before_record)::text || clock_timestamp()::text;
  computed_hash := encode(sha256(raw_payload::bytea), 'hex');
  insert into public.audit_events (
    actor_id, actor_email, action, entity_type, entity_id, branch_code,
    before_data, after_data, previous_hash, event_hash
  ) values (
    auth.uid(), auth.jwt()->>'email', tg_op, tg_table_name, record_id,
    coalesce(after_record->>'branch_code', after_record->'data'->>'branch_code', before_record->>'branch_code', before_record->'data'->>'branch_code'),
    before_record, after_record, prior_hash,
    computed_hash
  );
  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;

-- Direct writes to audit events are forbidden; records are generated only by the trigger.
alter table public.user_profiles enable row level security;
alter table public.audit_events enable row level security;

create policy "profile_self_or_admin_read" on public.user_profiles for select to authenticated
using (id = auth.uid() or (auth.jwt()->'app_metadata'->>'role') = 'it_admin');
create policy "profiles_admin_manage" on public.user_profiles for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'it_admin')
with check ((auth.jwt()->'app_metadata'->>'role') = 'it_admin');
create policy "audit_read_authorized" on public.audit_events for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('it_admin','ops_manager','audit_team'));

-- Apply tenant/branch isolation and auditing to the legacy JSON-data tables when present.
do $$
declare t text;
begin
  foreach t in array array['customers','loans','repayment_schedule','transactions','documents','grievances','investors','investor_txns']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists branch_isolation on public.%I', t);
      execute format($p$
        create policy branch_isolation on public.%I for all to authenticated
        using (
          (auth.jwt()->'app_metadata'->>'role') in ('it_admin','ops_manager','audit_team','executive')
          or coalesce(data->>'branch_code', data->>'branch', '') = coalesce(auth.jwt()->'app_metadata'->>'branch_code', '')
        )
        with check (
          (auth.jwt()->'app_metadata'->>'role') in ('it_admin','ops_manager','credit_officer','branch_manager')
          and (coalesce(data->>'branch_code', data->>'branch', '') = coalesce(auth.jwt()->'app_metadata'->>'branch_code', ''))
        )
      $p$, t);
      execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_event()', 'audit_' || t, t);
    end if;
  end loop;
end $$;

-- Immutable audit ledger: application roles may read, but cannot alter or remove events.
revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
