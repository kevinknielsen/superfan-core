-- QR Codes table for storing generated QR codes and tracking usage
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_id TEXT UNIQUE NOT NULL,
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL, -- privy_id of the admin who created it
    
    -- QR Code configuration
    source TEXT NOT NULL, -- 'show_entry', 'merch_purchase', 'event', etc.
    location TEXT,
    points INTEGER,
    expires_at TIMESTAMPTZ,
    
    -- URLs
    qr_url TEXT NOT NULL,
    tap_url TEXT NOT NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    description TEXT,
    
    -- Status and tracking
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_qr_id ON public.qr_codes(qr_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_club_id ON public.qr_codes(club_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_created_by ON public.qr_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_qr_codes_source ON public.qr_codes(source);
CREATE INDEX IF NOT EXISTS idx_qr_codes_created_at ON public.qr_codes(created_at);

-- RLS (Row Level Security) policies
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- Users can manage QR codes they created
CREATE POLICY "Users can manage their QR codes" ON public.qr_codes
    FOR ALL USING (
        created_by = auth.jwt() ->> 'sub'
    );

-- QR codes are readable by anyone (for scanning)
CREATE POLICY "QR codes are publicly readable" ON public.qr_codes
    FOR SELECT USING (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_qr_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_qr_codes_updated_at
    BEFORE UPDATE ON public.qr_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_qr_codes_updated_at();
