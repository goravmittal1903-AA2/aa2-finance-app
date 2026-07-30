# Enterprise readiness status

This application has functional MFI screens, but it was not safe to describe it as an enterprise system before the supporting controls are deployed. The migrations in `supabase/migrations/` establish authenticated access, MFA-gated branch isolation, immutable audit records, private document storage, full-text search, and job ledgers. Follow `SUPABASE_SETUP.md` before enabling them.

## Present in the user interface

| Capability | Current status |
| --- | --- |
| JLG, IL, Business and Emergency products; product defaults | Implemented in the new-loan screen |
| Loan collections, foreclosure workflow, schedule generation | Implemented, but calculation rules need business sign-off |
| Aging, PAR, collection efficiency, investor and board-oriented reports | Implemented as browser-side report views |
| Document intake, member 360 view, grievance and audit screens | Implemented as UI workflows |
| Inactivity warning at 13 minutes / sign-out at 15 minutes | UI timeout is implemented; Supabase session expiry still needs production configuration |
| Role-aware navigation | UI visibility plus database RLS/server API authorization after migrations are applied |
| Member list search and pagination | Database-side full-text search and 50-record pages |
| Private file uploads | Short-lived signed Supabase Storage upload/download URLs |
| Reconciliation and daily interest jobs | Protected, idempotent endpoints; requires deployment scheduler configuration |

## Not production-complete until deployed and tested

- Apply the migrations and configure the Supabase project as described in `SUPABASE_SETUP.md`.
- Move the remaining browser-side record writes to purpose-specific server actions/route handlers. RLS must be tested with every role and branch.
- Add Redis for distributed cache invalidation and a dedicated worker/queue if workloads exceed the protected scheduled endpoints.
- Implement approved RBI/NeSL schemas, statutory provisioning, tax logic, and accounting schedules only after a chartered accountant and regulatory/compliance owner approve the rules and reporting period.
- Put AES-256 envelope encryption for Aadhaar/PAN in a server-only service using a managed KMS; never encrypt with an in-browser key or a public environment variable.
- Add SMS/WhatsApp provider credentials and templates, consent logging, delivery callbacks, opt-outs, and field-photo access controls.
- Enforce IP allowlisting at the identity provider, WAF, and database-network layers. The profile field in the migration is an audit/configuration record, not a network firewall.
- Commission an independent VAPT, remediate findings, and retain the final report. VAPT cannot be truthfully marked complete from source code alone.

## Release gate

Do not place production customer data into this repository or deploy it until the items above have an accountable owner, evidence of testing, a backup/restore exercise, monitoring/alerting, incident response runbook, and written regulatory approval.
