# AA2 Finance: Supabase setup

Complete these steps before attempting to sign in to the hardened application. The old demo account and OTP bypass have deliberately been removed.

## 1. Create or select the Supabase project

1. Open the Supabase dashboard and create a production project in the correct data region.
2. In **Project Settings → API**, copy the Project URL and the publishable key. An older anon key also works with this codebase.
3. Create `.env.local` from `.env.example` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
FIELD_ENCRYPTION_KEY_BASE64=YOUR_32_BYTE_BASE64_KEY
CRON_SECRET=YOUR_LONG_RANDOM_CRON_SECRET
AUTH_CHALLENGE_SECRET=YOUR_SEPARATE_LONG_RANDOM_SECRET
```

Never commit `.env.local`, the service-role key, or the encryption key.

## 2. Apply the database migrations

Back up the current database first. Then, in **SQL Editor**, run these files in this exact order:

1. `supabase/migrations/202607140001_enterprise_controls.sql`
2. `supabase/migrations/202607140002_auth_jobs_storage.sql`
3. `supabase/migrations/202607140003_password_email_otp.sql`
4. `supabase/migrations/202607140004_login_security.sql`
5. `supabase/migrations/202607210001_three_roles.sql`
6. `supabase/migrations/202607210002_loan_documents_products.sql`  ← **NEW** (loan docs + products tables + storage bucket)

They create user profiles, RLS policies, audit events, private document storage, full-text indexes, loan document attachments, product management, and job/accrual tables. Do this in a staging project before production.

> **Important**: Migration 6 also creates the `loan-documents` storage bucket. If the bucket already exists, the `ON CONFLICT DO NOTHING` clause skips it safely.

## 3. Create the first administrator

1. Go to **Authentication → Users → Add user**.
2. Create the administrator with a strong unique password. Mark the email confirmed only if your organisation has verified it separately.
3. Run the following in SQL Editor, replacing the placeholders:

```sql
insert into public.branches (code, name)
values ('HARIDWAR', 'Haridwar Branch')
on conflict (code) do nothing;

update public.user_profiles
set display_name = 'AA2 IT Administrator',
    role = 'it_admin',
    branch_code = null,
    active = true
where email = 'admin@your-company.example';
```

Create one profile per employee. Assign only the minimum required role and branch. The profile role is the access-control source of truth; do not put roles in browser storage.

## 4. Configure email OTP login

The application uses email and password first, then an email one-time password (OTP). It does not use Microsoft Authenticator, Google Authenticator, or TOTP MFA.

1. Open **Authentication → Sign In / Providers → Email**.
2. Enable the Email provider.
3. Turn **Allow new users to sign up** off. Employees must be created by an administrator; the application will not create unknown accounts.
4. Open **Authentication → Email Templates → Magic Link / OTP**.
5. Replace the template body with an OTP template that includes `{{ .Token }}` and does **not** include `{{ .ConfirmationURL }}`. For example:

```html
<h2>AA2 Finance sign-in code</h2>
<p>Your one-time sign-in code is:</p>
<h1 style="letter-spacing: 6px;">{{ .Token }}</h1>
<p>This code is confidential. Do not share it with anyone.</p>
```

6. Back in the Email provider settings, set the OTP lifetime to 10 minutes or less and keep the default request rate limit. Use a custom SMTP provider before production; the built-in sender is for testing.

When a user enters their registered work email and password, the password is validated first. Supabase then sends a one-time code. The user enters that code in the application to receive a session. No authenticator-app configuration is required.

## 5. Configure storage and real-time

- The second migration creates the private `loan-documents` bucket and policies. Do not make it public.
- In **Database → Replication**, add `customers` to the `supabase_realtime` publication. Add `loans`, `documents`, and `grievances` when their corresponding live screens are enabled.
- New document uploads accept PDF, JPEG, PNG, and WebP files up to 10 MB. They use short-lived signed upload/download tokens.

## 6. Configure scheduled jobs

The app contains protected job endpoints:

- `/api/jobs/nightly-reconciliation`
- `/api/jobs/daily-accrual`

For Vercel deployments, `vercel.json` schedules them for 00:30 and 00:35 India time. Add the same `CRON_SECRET` as a Vercel environment variable. For another host, schedule authenticated GET or POST calls with this header:

```text
Authorization: Bearer YOUR_LONG_RANDOM_CRON_SECRET
```

Review `job_runs` every morning. The jobs are idempotent per business date and record failed runs.

## 7. Generate the AES-256 encryption key

Run this once in PowerShell and put the result in `FIELD_ENCRYPTION_KEY_BASE64`:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Store the production key in a managed secret store/KMS. Rotating or using separate keys per environment needs an approved data-migration plan.

## 8. Still requires a vendor or compliance owner

These cannot be activated from source code alone: SMS/WhatsApp sender accounts and approved templates, external S3/AWS if mandated instead of Supabase private storage, IP allowlisting at WAF/network level, RBI/NeSL submissions, statutory provisioning and tax rules, and the independent VAPT.
