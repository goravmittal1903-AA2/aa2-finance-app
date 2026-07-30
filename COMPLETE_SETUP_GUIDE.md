# AA2 Finance: simple setup guide

## Fix “Could not send the one-time code”

This is a Supabase email-delivery setting, not a password error. In Supabase,
open **Authentication → Providers → Email** and turn Email on. For real
business use, also configure **Authentication → SMTP Settings** with your
email provider; the default sender is rate-limited and only suitable for short
testing.

Open **Authentication → Email Templates → Magic Link** and include
`{{ .Token }}` in the email body. This application sends a numeric email code,
not a login link. Save it and try again after a minute.

## Login protection upgrade (run once)

In **Supabase → SQL Editor → New query**, run the entire contents of
`supabase/migrations/202607140004_login_security.sql`.

It enables five failed-password attempts → account lock → email-code
verification → required new password → unlocked sign-in. **Forgot password**
uses the same verified email-code process.

The default permitted employee domain is `aa2finance.com`. If yours differs,
run this SQL afterward, replacing the example domain:

```sql
update public.auth_security_settings
set allowed_email_domain = 'your-company-domain.com', updated_at = now()
where id = true;
```

The login process is: **email → password → email OTP code → dashboard**. No authenticator application is used.

## Do these now

### 1. Add the login secret

The app needs a private secret to ensure that a user cannot skip the password-to-OTP step.

In PowerShell, run:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Copy the generated value. Open `.env.local` in the project folder and paste it after:

```env
AUTH_CHALLENGE_SECRET=PASTE_THE_GENERATED_VALUE_HERE
```

Save the file. Do not send this value to anyone.

### 2. Run the additional SQL migration

Because the earlier files were configured for authenticator MFA, open Supabase **SQL Editor** and run:

`supabase/migrations/202607140003_password_email_otp.sql`

This changes the policies to match password + email OTP login.

### 3. Configure the email OTP message

Go to **Authentication → Sign In / Providers → Email**:

1. Enable Email.
2. Turn **Allow new users to sign up** off.
3. Set Email OTP expiry to 10 minutes or less.

Then go to **Authentication → Email Templates → Magic Link / OTP** and use:

```html
<h2>AA2 Finance sign-in code</h2>
<p>Enter this one-time code in AA2 Finance:</p>
<h1 style="letter-spacing: 6px;">{{ .Token }}</h1>
<p>Never share this code. If you did not request it, contact AA2 Finance IT.</p>
```

Use `{{ .Token }}`. Do not use `{{ .ConfirmationURL }}`, which would send a link instead of a code.

### 4. Create the first administrator

1. Go to **Authentication → Users → Add user**.
2. Create your admin work email and set a strong password.
3. In SQL Editor, run this after replacing the sample email:

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

### 5. Test login

Run the app with `npm.cmd run dev`, then open `http://localhost:3000/login`.

Enter the admin email and password. The system sends an email code. Enter the code to access the dashboard.

## What Steps 6–9 mean

You can do these later, after login works.

### Step 6: data features

This just means testing two features already created by the migrations:

- **Private documents:** make sure the `loan-documents` bucket is private. Upload a test PDF from the Documents page.
- **Real-time members:** go to **Database → Replication** and add `customers` to the `supabase_realtime` publication. Then changes to members refresh the member list automatically.

### Step 7: production secrets

Only do this when deploying online. Add these securely to the hosting provider, not to chat:

- `SUPABASE_SERVICE_ROLE_KEY`: required for the automated daily jobs.
- `FIELD_ENCRYPTION_KEY_BASE64`: required when storing encrypted Aadhaar/PAN values.
- `CRON_SECRET`: protects automated reconciliation and daily-interest jobs.
- `AUTH_CHALLENGE_SECRET`: already required now for password + email OTP login.

### Step 8: deployment and automated jobs

When the app is ready for online use, deploy it to Vercel or another Node.js host. Add all environment variables there. Vercel uses `vercel.json` to run nightly reconciliation and daily-interest jobs automatically. Until the app is deployed, you can ignore this step.

### Step 9: final safety checks

Before real customer use, test staff roles, branch restrictions, document access, backups, and OTP expiry. Then arrange custom email SMTP, monitoring, IP/WAF controls, and an independent security test. RBI/NeSL/tax reports require approval from your compliance and accounting owners.
