-- Run this migration if 202607140001 and 202607140002 were already applied.
-- It changes access policies from authenticator-app MFA to the password + email
-- OTP application flow. The app verifies the signed OTP gate on pages and APIs.

create or replace function public.has_verified_session()
returns boolean language sql stable as $$ select auth.uid() is not null $$;

drop policy if exists "aa2_private_documents_read" on storage.objects;
create policy "aa2_private_documents_read" on storage.objects for select to authenticated
using (bucket_id = 'loan-documents' and public.has_verified_session() and (public.has_global_access() or (storage.foldername(name))[1] = public.app_branch()));

drop policy if exists "aa2_private_documents_write" on storage.objects;
create policy "aa2_private_documents_write" on storage.objects for insert to authenticated
with check (bucket_id = 'loan-documents' and public.has_verified_session() and public.app_role() in ('it_admin','ops_manager','branch_manager','credit_officer','field_officer') and (storage.foldername(name))[1] = public.app_branch());

drop policy if exists "aa2_private_documents_delete" on storage.objects;
create policy "aa2_private_documents_delete" on storage.objects for delete to authenticated
using (bucket_id = 'loan-documents' and public.has_verified_session() and public.app_role() in ('it_admin','ops_manager','branch_manager') and (public.has_global_access() or (storage.foldername(name))[1] = public.app_branch()));

do $$
declare t text;
begin
  foreach t in array array['customers','loans','repayment_schedule','transactions','documents','grievances','investors','investor_txns']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists enterprise_read on public.%I', t);
      execute format('drop policy if exists enterprise_write on public.%I', t);
      execute format('drop policy if exists enterprise_update on public.%I', t);
      execute format('create policy enterprise_read on public.%I for select to authenticated using (public.has_verified_session() and public.branch_access(data))', t);
      execute format('create policy enterprise_write on public.%I for insert to authenticated with check (public.has_verified_session() and public.app_role() in (''it_admin'',''ops_manager'',''branch_manager'',''credit_officer'') and public.branch_access(data))', t);
      execute format('create policy enterprise_update on public.%I for update to authenticated using (public.has_verified_session() and public.app_role() in (''it_admin'',''ops_manager'',''branch_manager'',''credit_officer'',''cashier'',''field_officer'') and public.branch_access(data)) with check (public.has_verified_session() and public.branch_access(data))', t);
    end if;
  end loop;
end $$;
