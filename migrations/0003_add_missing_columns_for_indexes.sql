ALTER TABLE user_sessions ADD COLUMN session_token text UNIQUE;
ALTER TABLE user_sessions ADD COLUMN refresh_token text UNIQUE;
ALTER TABLE user_sessions ADD COLUMN last_accessed_at timestamp DEFAULT now();
ALTER TABLE user_sessions ADD COLUMN is_active boolean DEFAULT true;

ALTER TABLE audit_trail ADD COLUMN action text;
ALTER TABLE audit_trail ADD COLUMN resource text;
ALTER TABLE audit_trail ADD COLUMN resource_id text;
ALTER TABLE audit_trail ADD COLUMN success boolean DEFAULT true;
ALTER TABLE audit_trail ADD COLUMN risk_level text DEFAULT 'low';
ALTER TABLE audit_trail ADD COLUMN created_at timestamp DEFAULT now();
ALTER TABLE audit_trail ADD COLUMN entity_type text;
ALTER TABLE audit_trail ADD COLUMN timestamp timestamp DEFAULT now();
