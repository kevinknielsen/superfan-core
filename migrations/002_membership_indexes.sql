-- Performance indexes
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_memberships_period_end ON memberships(current_period_end);

CREATE INDEX idx_house_accounts_user_id ON house_accounts(user_id);
CREATE INDEX idx_house_transactions_account_id ON house_transactions(house_account_id);
CREATE INDEX idx_house_transactions_type ON house_transactions(type);
CREATE INDEX idx_house_transactions_created_at ON house_transactions(created_at);

CREATE INDEX idx_redemption_codes_code ON redemption_codes(code) WHERE is_active = true;
CREATE INDEX idx_redemption_codes_expires_at ON redemption_codes(expires_at) WHERE is_active = true;

CREATE INDEX idx_code_redemptions_user_id ON code_redemptions(user_id);
CREATE INDEX idx_code_redemptions_redeemed_at ON code_redemptions(redeemed_at);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_membership_plans_updated_at BEFORE UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_house_accounts_updated_at BEFORE UPDATE ON house_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
