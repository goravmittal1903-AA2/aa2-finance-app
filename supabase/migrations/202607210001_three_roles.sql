-- Simplify roles to three: employee, admin, it
-- Run in Supabase SQL Editor after the previous four migrations.

-- 1. Drop the old role check constraint first so we can update existing data.
alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

-- 2. Map every existing role in user_profiles to the new three-tier model.
update public.user_profiles set role = 'it'
  where role in ('it_admin');

update public.user_profiles set role = 'admin'
  where role in ('ops_manager', 'branch_manager', 'credit_officer', 'audit_team', 'executive');

update public.user_profiles set role = 'employee'
  where role in ('field_officer', 'cashier', 'investor', 'employee');

-- Fallback for any other unexpected role value
update public.user_profiles set role = 'employee'
  where role not in ('employee', 'admin', 'it');

-- 3. Now add the new check constraint for the 3 roles.
alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('employee', 'admin', 'it'));

-- 4. Recreate helper functions to reflect new roles.
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select role from public.user_profiles where id = auth.uid()), '') $$;

create or replace function public.has_global_access()
returns boolean language sql stable as $$ select public.app_role() in ('it', 'admin') $$;

-- 5. Update RLS policies on user_profiles.
drop policy if exists "profile_self_or_admin_read" on public.user_profiles;
drop policy if exists "profiles_admin_manage"       on public.user_profiles;

create policy "profile_self_or_admin_read" on public.user_profiles for select to authenticated
  using (id = auth.uid() or public.app_role() = 'it');

create policy "profiles_admin_manage" on public.user_profiles for all to authenticated
  using (public.app_role() = 'it') with check (public.app_role() = 'it');

-- 6. Update audit event read policy.
drop policy if exists "audit_read_authorized" on public.audit_events;
create policy "audit_read_authorized" on public.audit_events for select to authenticated
  using (public.app_role() in ('it', 'admin'));

-- 7. Update data table enterprise policies.
do $$
declare t text;
begin
  foreach t in array array['customers','loans','repayment_schedule','transactions','documents','grievances','investors','investor_txns']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists enterprise_read   on public.%I', t);
      execute format('drop policy if exists enterprise_write  on public.%I', t);
      execute format('drop policy if exists enterprise_update on public.%I', t);
      -- All authenticated users can read their branch data.
      execute format('create policy enterprise_read on public.%I for select to authenticated using (public.has_verified_session() and public.branch_access(data))', t);
      -- admin and it can insert.
      execute format('create policy enterprise_write on public.%I for insert to authenticated with check (public.has_verified_session() and public.app_role() in (''admin'',''it'') and public.branch_access(data))', t);
      -- employee, admin, it can update (cashier / field collections).
      execute format('create policy enterprise_update on public.%I for update to authenticated using (public.has_verified_session() and public.app_role() in (''employee'',''admin'',''it'') and public.branch_access(data)) with check (public.has_verified_session() and public.branch_access(data))', t);
    end if;
  end loop;
end $$;

-- 8. Update storage policies.
drop policy if exists "aa2_private_documents_read"   on storage.objects;
drop policy if exists "aa2_private_documents_write"  on storage.objects;
drop policy if exists "aa2_private_documents_delete" on storage.objects;

create policy "aa2_private_documents_read" on storage.objects for select to authenticated
  using (bucket_id = 'loan-documents' and public.has_verified_session()
         and (public.has_global_access() or (storage.foldername(name))[1] = public.app_branch()));

create policy "aa2_private_documents_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'loan-documents' and public.has_verified_session()
              and public.app_role() in ('admin','it')
              and (storage.foldername(name))[1] = public.app_branch());

create policy "aa2_private_documents_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'loan-documents' and public.has_verified_session()
         and public.app_role() in ('admin','it')
         and (public.has_global_access() or (storage.foldername(name))[1] = public.app_branch()));

-- 9. Update job_runs and accruals policies.
drop policy if exists "job_runs_it_only"   on public.job_runs;
drop policy if exists "accruals_it_only"   on public.daily_interest_accruals;

create policy "job_runs_it_only" on public.job_runs for all to authenticated
  using (public.app_role() = 'it') with check (public.app_role() = 'it');

create policy "accruals_it_only" on public.daily_interest_accruals for all to authenticated
  using (public.app_role() in ('it','admin')) with check (public.app_role() in ('it','admin'));

-- 10. Update the auto-provision trigger to default new users to 'employee'.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name, role, active)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
          'employee', true)
  on conflict (id) do nothing;
  return new;
end;
$$;
