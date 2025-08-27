-- Performance indexes for Club schema

-- Club membership indexes
CREATE INDEX idx_club_memberships_user_id ON club_memberships(user_id);
CREATE INDEX idx_club_memberships_club_id ON club_memberships(club_id);
CREATE INDEX idx_club_memberships_status ON club_memberships(status);
CREATE INDEX idx_club_memberships_current_status ON club_memberships(current_status);
CREATE INDEX idx_club_memberships_points ON club_memberships(points);
CREATE INDEX idx_club_memberships_last_activity ON club_memberships(last_activity_at);

-- Tap-ins indexes
CREATE INDEX idx_tap_ins_user_club ON tap_ins(user_id, club_id);
CREATE INDEX idx_tap_ins_source ON tap_ins(source);
CREATE INDEX idx_tap_ins_created_at ON tap_ins(created_at);

-- Points ledger indexes
CREATE INDEX idx_points_ledger_user_club ON points_ledger(user_id, club_id);
CREATE INDEX idx_points_ledger_reason ON points_ledger(reason);
CREATE INDEX idx_points_ledger_created_at ON points_ledger(created_at);

-- Unlocks indexes
CREATE INDEX idx_unlocks_club_id ON unlocks(club_id);
CREATE INDEX idx_unlocks_type ON unlocks(type);
CREATE INDEX idx_unlocks_min_status ON unlocks(min_status);
CREATE INDEX idx_unlocks_is_active ON unlocks(is_active) WHERE is_active = true;
CREATE INDEX idx_unlocks_window ON unlocks(window_start, window_end) WHERE window_start IS NOT NULL;

-- Redemptions indexes
CREATE INDEX idx_redemptions_user_id ON redemptions(user_id);
CREATE INDEX idx_redemptions_unlock_id ON redemptions(unlock_id);
CREATE INDEX idx_redemptions_status ON redemptions(status);
CREATE INDEX idx_redemptions_redeemed_at ON redemptions(redeemed_at);

-- House accounts indexes
CREATE INDEX idx_house_accounts_user_club ON house_accounts(user_id, club_id);
CREATE INDEX idx_house_transactions_account_id ON house_transactions(house_account_id);
CREATE INDEX idx_house_transactions_type ON house_transactions(type);
CREATE INDEX idx_house_transactions_created_at ON house_transactions(created_at);

-- Clubs indexes
CREATE INDEX idx_clubs_owner_id ON clubs(owner_id);
CREATE INDEX idx_clubs_is_active ON clubs(is_active) WHERE is_active = true;

-- Add updated_at triggers for tables that need them
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_club_memberships_updated_at BEFORE UPDATE ON club_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_unlocks_updated_at BEFORE UPDATE ON unlocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_redemptions_updated_at BEFORE UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_house_accounts_updated_at BEFORE UPDATE ON house_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Status thresholds configuration (based on memo: Cadet (0) → Resident (500) → Headliner (1500) → Superfan (4000))
CREATE TABLE status_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('cadet', 'resident', 'headliner', 'superfan')),
  min_points INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO status_thresholds (status, min_points) VALUES
('cadet', 0),
('resident', 500),
('headliner', 1500),
('superfan', 4000);

-- Function to calculate current status based on points
CREATE OR REPLACE FUNCTION calculate_status(points INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF points >= 4000 THEN RETURN 'superfan';
  ELSIF points >= 1500 THEN RETURN 'headliner';
  ELSIF points >= 500 THEN RETURN 'resident';
  ELSE RETURN 'cadet';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
