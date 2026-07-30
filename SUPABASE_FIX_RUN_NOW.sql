-- ─────────────────────────────────────────────────────────────────────────────
-- AA2 Finance: Complete Supabase System, Storage & Audit Configuration (IDEMPOTENT)
-- Run this ENTIRE script in Supabase SQL Editor in one go.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enable pgcrypto extension in public and extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- 2. Create Storage Bucket for Loan Documents if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('loan-documents', 'loan-documents', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

-- Storage object access policy
DROP POLICY IF EXISTS "loan_documents_authenticated_access" ON storage.objects;
CREATE POLICY "loan_documents_authenticated_access" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'loan-documents') WITH CHECK (bucket_id = 'loan-documents');

-- 3. Create core tables if not exist
CREATE TABLE IF NOT EXISTS public.customers (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.loans (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.repayment_schedule (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.transactions (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.documents (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.loan_documents (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.grievances (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.investors (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.investor_txns (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.borrowings (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.borrowing_txns (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.cash_accounts (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.cash_txns (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.expenses (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.fixed_assets (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.products (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.trash (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.audit_log (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  branch_code text,
  before_data jsonb,
  after_data jsonb,
  previous_hash text,
  event_hash text NOT NULL
);

-- 4. Create write_audit_event trigger function using built-in Postgres sha256()
CREATE OR REPLACE FUNCTION public.write_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  prior_hash text;
  before_record jsonb;
  after_record jsonb;
  record_id text;
  raw_payload text;
  computed_hash text;
BEGIN
  before_record := CASE WHEN tg_op IN ('UPDATE','DELETE') THEN to_jsonb(old) ELSE null END;
  after_record  := CASE WHEN tg_op IN ('INSERT','UPDATE') THEN to_jsonb(new) ELSE null END;
  record_id     := coalesce(after_record->>'id', before_record->>'id', 'unknown');
  
  SELECT event_hash INTO prior_hash FROM public.audit_events ORDER BY occurred_at DESC, id DESC LIMIT 1;

  raw_payload := coalesce(prior_hash, '') || tg_op || tg_table_name || record_id || coalesce(after_record, before_record)::text || clock_timestamp()::text;
  
  computed_hash := encode(sha256(raw_payload::bytea), 'hex');

  INSERT INTO public.audit_events (
    actor_id, actor_email, action, entity_type, entity_id, branch_code,
    before_data, after_data, previous_hash, event_hash
  ) VALUES (
    auth.uid(), auth.jwt()->>'email', tg_op, tg_table_name, record_id,
    coalesce(after_record->>'branch_code', after_record->'data'->>'branch_code', before_record->>'branch_code', before_record->'data'->>'branch_code'),
    before_record, after_record, prior_hash,
    computed_hash
  );

  RETURN coalesce(new, old);
EXCEPTION WHEN OTHERS THEN
  RETURN coalesce(new, old);
END;
$$;

-- Attach audit trigger to main application tables
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['customers','loans','repayment_schedule','transactions','documents','grievances','investors','borrowings','expenses','fixed_assets'])
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_trigger ON public.%I', tbl, tbl);
      EXECUTE format('CREATE TRIGGER audit_%I_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- 5. Enable RLS and permissive policies for all stores
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','loans','repayment_schedule','transactions',
    'documents','grievances','investors','investor_txns',
    'loan_documents','products','trash','audit_log','audit_events',
    'borrowings','borrowing_txns','cash_accounts','cash_txns','expenses','fixed_assets'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN

      EXECUTE format('DROP POLICY IF EXISTS branch_isolation         ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_all  ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS authenticated_all        ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS enterprise_read          ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS enterprise_write         ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS enterprise_update        ON public.%I', t);

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      EXECUTE format($p$
        CREATE POLICY allow_authenticated_all ON public.%I
          FOR ALL
          TO authenticated
          USING (true)
          WITH CHECK (true)
      $p$, t);

    END IF;
  END LOOP;
END $$;

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_loans_customer_btree   ON public.loans               USING btree ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_loans_status_btree     ON public.loans               USING btree ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_loans_branch_btree     ON public.loans               USING btree ((data->>'branch_code'));
CREATE INDEX IF NOT EXISTS idx_sched_loan_btree       ON public.repayment_schedule  USING btree ((data->>'loan_account_no'));
CREATE INDEX IF NOT EXISTS idx_sched_status_btree     ON public.repayment_schedule  USING btree ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_sched_duedate_btree    ON public.repayment_schedule  USING btree ((data->>'due_date'));
CREATE INDEX IF NOT EXISTS idx_txns_loan_btree        ON public.transactions        USING btree ((data->>'txn_date'));
CREATE INDEX IF NOT EXISTS idx_customers_mobile_btree ON public.customers           USING btree ((data->>'mobile'));
CREATE INDEX IF NOT EXISTS idx_docs_loan_btree        ON public.documents           USING btree ((data->>'loan_account_no'));
CREATE INDEX IF NOT EXISTS idx_trash_store_btree       ON public.trash               USING btree ((data->>'store_name'));
CREATE INDEX IF NOT EXISTS idx_audit_entity_btree      ON public.audit_log           USING btree ((data->>'entity_id'));

-- 7. Verification Query
SELECT tablename, policyname, permissive, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
