-- Setup Status Thresholds (Superfan Point System)
-- Based on superfan-core-memo.md: Cadet (0) → Resident (500) → Headliner (1500) → Superfan (4000)

-- Insert status thresholds if they don't exist
INSERT INTO status_thresholds (name, points_required, description) VALUES
('Cadet', 0, 'New fan - just getting started'),
('Resident', 500, 'Regular fan with some engagement'),
('Headliner', 1500, 'Dedicated fan with significant engagement'),
('Superfan', 4000, 'Ultimate fan with maximum perks and access')
ON CONFLICT (name) DO NOTHING;

-- Verify the data
SELECT * FROM status_thresholds ORDER BY points_required;
