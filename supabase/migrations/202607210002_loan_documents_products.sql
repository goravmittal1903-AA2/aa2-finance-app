-- Migration: Loan Documents & Products Tables
-- Run this in Supabase SQL Editor

-- ─── loan_documents table ──────────────────────────────────────────────────────
-- Stores metadata of documents uploaded against a loan account
CREATE TABLE IF NOT EXISTS public.loan_documents (
  id          TEXT PRIMARY KEY,    -- doc_id
  data        JSONB NOT NULL       -- the LoanDocument JSON blob
);

-- Index for fast queries by loan_account_no (inside data jsonb)
CREATE INDEX IF NOT EXISTS idx_loan_documents_loan
  ON public.loan_documents USING gin (data jsonb_path_ops);

-- Enable Row Level Security
ALTER TABLE public.loan_documents ENABLE ROW LEVEL SECURITY;

-- Policy: allow all authenticated users to read
CREATE POLICY "Authenticated can read loan_documents"
  ON public.loan_documents FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: allow authenticated users to insert / update
CREATE POLICY "Authenticated can insert loan_documents"
  ON public.loan_documents FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update loan_documents"
  ON public.loan_documents FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete loan_documents"
  ON public.loan_documents FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─── products table ────────────────────────────────────────────────────────────
-- Stores loan product definitions (interest rates, tenure ranges, etc.)
CREATE TABLE IF NOT EXISTS public.products (
  id    TEXT PRIMARY KEY,    -- product_id
  data  JSONB NOT NULL       -- the Product JSON blob
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read products"
  ON public.products FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin/IT can insert products"
  ON public.products FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin/IT can update products"
  ON public.products FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin/IT can delete products"
  ON public.products FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─── Supabase Storage bucket for loan documents ─────────────────────────────
-- Run this separately in Storage section or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('loan-documents', 'loan-documents', true);

-- OR via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('loan-documents', 'loan-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated can upload loan docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'loan-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view loan docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'loan-documents');

CREATE POLICY "Authenticated can delete loan docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'loan-documents' AND auth.role() = 'authenticated');
