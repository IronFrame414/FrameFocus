-- Migration 009: Company settings columns + logo storage

-- Add company detail columns (skip any that already exist)
DO $$
BEGIN
  -- Address fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'address_line1') THEN
    ALTER TABLE companies ADD COLUMN address_line1 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'address_line2') THEN
    ALTER TABLE companies ADD COLUMN address_line2 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'city') THEN
    ALTER TABLE companies ADD COLUMN city TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'state') THEN
    ALTER TABLE companies ADD COLUMN state TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'zip') THEN
    ALTER TABLE companies ADD COLUMN zip TEXT;
  END IF;
  -- Contact info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'phone') THEN
    ALTER TABLE companies ADD COLUMN phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'website') THEN
    ALTER TABLE companies ADD COLUMN website TEXT;
  END IF;
  -- Business info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'trade_type') THEN
    ALTER TABLE companies ADD COLUMN trade_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'license_number') THEN
    ALTER TABLE companies ADD COLUMN license_number TEXT;
  END IF;
  -- Logo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'logo_url') THEN
    ALTER TABLE companies ADD COLUMN logo_url TEXT;
  END IF;
END $$;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Authenticated users can upload to their company's folder
CREATE POLICY "company_logos_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1)
);

-- Storage policy: Authenticated users can update their company's files
CREATE POLICY "company_logos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1)
);

-- Storage policy: Anyone can read company logos (they're public)
CREATE POLICY "company_logos_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-logos');

-- Storage policy: Owner/Admin can delete their company's logos
CREATE POLICY "company_logos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1)
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND is_deleted = false
    AND role IN ('owner', 'admin')
  )
);