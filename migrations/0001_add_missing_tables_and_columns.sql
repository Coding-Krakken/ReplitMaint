-- Add qr_code column to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS qr_code TEXT;

-- Add enabled column to pm_templates (boolean, default true)
ALTER TABLE pm_templates ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  device_info JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT NOW()
);

-- Create audit_trail table
CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
