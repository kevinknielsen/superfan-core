-- Fix QR codes RLS policies to allow proper access

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their QR codes" ON public.qr_codes;
DROP POLICY IF EXISTS "QR codes are publicly readable" ON public.qr_codes;

-- Allow authenticated users to insert QR codes
CREATE POLICY "Authenticated users can insert QR codes" ON public.qr_codes
    FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

-- Users can read and manage QR codes they created
CREATE POLICY "Users can manage their QR codes" ON public.qr_codes
    FOR SELECT USING (
        created_by = auth.jwt() ->> 'sub' OR 
        auth.jwt() ->> 'sub' IS NOT NULL
    );

-- Users can update their own QR codes
CREATE POLICY "Users can update their QR codes" ON public.qr_codes
    FOR UPDATE USING (created_by = auth.jwt() ->> 'sub')
    WITH CHECK (created_by = auth.jwt() ->> 'sub');

-- Users can delete their own QR codes  
CREATE POLICY "Users can delete their QR codes" ON public.qr_codes
    FOR DELETE USING (created_by = auth.jwt() ->> 'sub');

-- QR codes are readable by anyone (for scanning)
CREATE POLICY "QR codes are publicly readable" ON public.qr_codes
    FOR SELECT USING (true);
