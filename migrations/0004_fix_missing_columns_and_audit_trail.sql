ALTER TABLE equipment ADD COLUMN qr_code text;
ALTER TABLE pm_templates ADD COLUMN enabled boolean DEFAULT true;

DROP TABLE IF EXISTS audit_trail CASCADE;
CREATE TABLE audit_trail (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  event_type varchar(100) NOT NULL,
  resource_type varchar(100),
  resource_id uuid,
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp DEFAULT now(),
  action text,
  resource text,
  success boolean DEFAULT true,
  risk_level text DEFAULT 'low',
  entity_type text,
  timestamp timestamp DEFAULT now()
);
