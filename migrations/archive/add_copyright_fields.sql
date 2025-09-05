-- Migration: Add copyright and producer fields to team_members table
-- Run this in your Supabase SQL editor

ALTER TABLE team_members 
ADD COLUMN IF NOT EXISTS copyright_type TEXT DEFAULT 'sound_recording' CHECK (copyright_type IN ('sound_recording', 'composition', 'both')),
ADD COLUMN IF NOT EXISTS composition_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS recording_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS producer_points DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS flat_fee INTEGER,
ADD COLUMN IF NOT EXISTS backend_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS pro_affiliation TEXT CHECK (pro_affiliation IN ('ASCAP', 'BMI', 'SESAC', 'SOCAN', 'PRS')),
ADD COLUMN IF NOT EXISTS ipi_number TEXT,
ADD COLUMN IF NOT EXISTS publisher TEXT,
ADD COLUMN IF NOT EXISTS deal_type TEXT DEFAULT 'indie' CHECK (deal_type IN ('indie', 'major_label', 'flat_fee_only'));

-- Update existing records to have default values
UPDATE team_members 
SET 
  copyright_type = CASE 
    WHEN role IN ('Songwriter', 'Composer', 'Lyricist') THEN 'composition'
    WHEN role = 'Producer' THEN 'both'
    ELSE 'sound_recording'
  END,
  recording_percentage = revenue_share_pct,
  composition_percentage = CASE 
    WHEN role IN ('Songwriter', 'Composer', 'Lyricist', 'Producer') THEN revenue_share_pct
    ELSE NULL
  END
WHERE copyright_type IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_members_copyright_type ON team_members(copyright_type);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);
CREATE INDEX IF NOT EXISTS idx_team_members_pro_affiliation ON team_members(pro_affiliation);

-- Add comment explaining the new structure
COMMENT ON COLUMN team_members.copyright_type IS 'Specifies which copyright(s) this member has rights to: sound_recording (master), composition (publishing), or both';
COMMENT ON COLUMN team_members.composition_percentage IS 'Percentage of songwriting/publishing rights (0-100)';
COMMENT ON COLUMN team_members.recording_percentage IS 'Percentage of sound recording/master rights (0-100)';
COMMENT ON COLUMN team_members.producer_points IS 'Producer points for major label deals (typically 3-7)';
COMMENT ON COLUMN team_members.flat_fee IS 'Upfront fee paid to producer in cents (e.g., 150000 = $1,500)';
COMMENT ON COLUMN team_members.backend_percentage IS 'Percentage of net royalties for indie deals (typically 15-25%)'; 