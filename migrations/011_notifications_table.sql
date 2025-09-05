-- Create notifications table for tracking email/SMS notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'perk_redemption', 'welcome', 'reminder', etc.
  channel VARCHAR(20) NOT NULL, -- 'email', 'sms', 'push'
  recipient VARCHAR(255) NOT NULL, -- email address or phone number
  subject VARCHAR(255), -- for email notifications
  content TEXT NOT NULL, -- email HTML or SMS text
  metadata JSONB, -- additional data like redemption_id, unlock_id, etc.
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
  error_message TEXT, -- if failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_metadata ON notifications USING GIN(metadata);

-- Add RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid()::text = (SELECT privy_id FROM users WHERE id = user_id));

-- Only system can insert notifications (no direct user access)
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE notifications IS 'Stores email/SMS notifications sent to users for perk redemptions and other events';
