-- Password-login protection: approved work-email domain, five-attempt lockout,
-- and self-service unlock only after a verified email OTP and password reset.

create table if not exists public.auth_security_settings (
  id boolean primary key default true check (id),
  allowed_email_domain text not null default 'aa2finance.com',
  max_failed_attempts integer not null default 5 check (max_failed_attempts between 3 and 10),
  updated_at timestamptz not null default now()
);
insert into public.auth_security_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.login_security (
  email text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.auth_security_settings enable row level security;
alter table public.login_security enable row level security;

create or replace function public.login_account_status(p_email text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  allowed_domain text;
  profile_active boolean;
  is_locked boolean;
begin
  select lower(allowed_email_domain) into allowed_domain from public.auth_security_settings where id = true;
  if split_part(lower(trim(p_email)), '@', 2) <> allowed_domain then return 'invalid_domain'; end if;
  select active into profile_active from public.user_profiles where lower(email) = lower(trim(p_email));
  if profile_active is null then return 'unknown_email'; end if;
  if not profile_active then return 'inactive'; end if;
  select locked_at is not null into is_locked from public.login_security where lower(email) = lower(trim(p_email));
  if coalesce(is_locked, false) then return 'locked'; end if;
  return 'ok';
end;
$$;

create or replace function public.record_login_failure(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare max_attempts integer; new_attempts integer;
begin
  select max_failed_attempts into max_attempts from public.auth_security_settings where id = true;
  insert into public.login_security as s (email, failed_attempts, updated_at)
  values (lower(trim(p_email)), 1, now())
  on conflict (email) do update set failed_attempts = s.failed_attempts + 1, updated_at = now()
  returning failed_attempts into new_attempts;
  if new_attempts >= max_attempts then
    update public.login_security set locked_at = now(), updated_at = now() where email = lower(trim(p_email));
    return 'locked';
  end if;
  return 'failed';
end;
$$;

create or replace function public.clear_login_lock(p_email text)
returns void language sql security definer set search_path = public as $$
  update public.login_security set failed_attempts = 0, locked_at = null, updated_at = now()
  where email = lower(trim(p_email));
$$;

revoke all on public.auth_security_settings, public.login_security from anon, authenticated;
grant execute on function public.login_account_status(text), public.record_login_failure(text), public.clear_login_lock(text) to anon, authenticated;
