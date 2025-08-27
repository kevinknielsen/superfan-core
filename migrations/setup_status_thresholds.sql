-- Setup Status Thresholds (Superfan Point System)
-- Based on superfan-core-memo.md: Cadet (0) → Resident (500) → Headliner (1500) → Superfan (4000)

-- The table should already exist from migration 004_club_indexes.sql
-- But let's verify and show the data
SELECT * FROM status_thresholds ORDER BY min_points;
